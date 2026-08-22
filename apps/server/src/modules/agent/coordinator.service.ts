// AgentCoordinator：编排 Planner + Executor。
// 负责：初始计划创建 / 顺序执行子任务 / 失败检测与 replan / 断点续跑（跳过已完成）/
// 审计回调集成。planner、executor 由 DI 注入；audit_callback、max_replans 作为配置项，

import { Injectable, Logger } from '@nestjs/common';
import { ExecutorService } from './executor.service';
import { PlannerService } from './planner.service';
import {
  CoordinationState,
  CoordinationStatus,
  ExecutionResult,
  FailureStrategy,
  SubTask,
  SubTaskStatus,
  TaskPlan,
} from './schemas';

/// 审计回调。
/// Stage 4 生产接线时会换成 EventEmitter2 事件
export type AuditCallback = (
  subtask: SubTask,
  result: ExecutionResult,
) => Promise<void>;

export interface CoordinatorOptions {
  auditCallback?: AuditCallback | null;
  maxReplans?: number;
}

/// _handle_failure 的返回信号（内部控制流，不是领域状态，故保留字符串字面量联合）。
type FailureOutcome = 'continued' | 'aborted' | 'replanned';

@Injectable()
export class CoordinatorService {
  private readonly logger = new Logger(CoordinatorService.name);
  private readonly auditCallback: AuditCallback | null;
  private readonly maxReplans: number;

  constructor(
    private readonly planner: PlannerService,
    private readonly executor: ExecutorService,
    options: CoordinatorOptions = {},
  ) {
    this.auditCallback = options.auditCallback ?? null;
    this.maxReplans = options.maxReplans ?? 3;
  }

  /// 通过 Planner -> Executor 协调执行一个完整任务。
  async run(
    taskId: string,
    orgId: string,
    navigationGoal: string,
    context?: Record<string, unknown> | null,
    resumeFrom?: string[] | null,
  ): Promise<CoordinationState> {
    const state = new CoordinationState({
      task_id: taskId,
      org_id: orgId,
      navigation_goal: navigationGoal,
      completed_subtasks: resumeFrom ?? [],
      max_replans: this.maxReplans,
    });

    // Step 1: 创建初始计划
    let plan: TaskPlan;
    try {
      plan = await this.planner.createPlan(navigationGoal, context);
    } catch (e) {
      this.logger.error(`Coordinator: planning failed for task ${taskId}: ${e}`);
      state.status = CoordinationStatus.FAILED;
      state.error_message = `Planning failed: ${e instanceof Error ? e.message : String(e)}`;
      return state;
    }

    state.current_plan = plan;
    this.logger.log(
      `Coordinator: task ${taskId} planned with ${plan.subtasks.length} sub-tasks`,
    );

    // Step 2: 执行子任务
    const completedSubtasks: SubTask[] = [];
    return this.executePlan(state, plan, completedSubtasks, context);
  }

  /// 执行一个计划里的所有子任务。
  private async executePlan(
    state: CoordinationState,
    plan: TaskPlan,
    completedSubtasks: SubTask[],
    context?: Record<string, unknown> | null,
  ): Promise<CoordinationState> {
    for (const subtask of plan.subtasks) {
      // 断点续跑：跳过已完成的子任务
      if (state.completed_subtasks.includes(subtask.subtask_id)) {
        this.logger.log(
          `Coordinator: skipping already-completed subtask ${subtask.subtask_id}`,
        );
        completedSubtasks.push(subtask);
        continue;
      }

      // 执行
      const result = await this.executor.executeSubtask(subtask, context);

      // 审计回调（包 try/catch：旁路失败不影响主流程）
      if (this.auditCallback) {
        try {
          await this.auditCallback(subtask, result);
        } catch (e) {
          this.logger.warn(
            `Coordinator: audit callback failed for subtask ${subtask.subtask_id}: ${e}`,
          );
        }
      }

      if (result.success) {
        state.completed_subtasks.push(subtask.subtask_id);
        completedSubtasks.push(subtask);
        continue;
      }

      // 按策略处理失败
      const outcome = await this.handleFailure(
        state,
        plan,
        subtask,
        result,
        completedSubtasks,
        context,
      );
      if (outcome === 'aborted') {
        return state;
      }
      if (outcome === 'replanned') {
        return state; // handleFailure 内部已递归进入新计划
      }
    }

    // 全部子任务完成
    state.status = CoordinationStatus.COMPLETED;
    this.logger.log(`Coordinator: task ${state.task_id} completed successfully`);
    return state;
  }

  /// 按失败策略处理一个失败的子任务。
  /// 返回：continued（跳过继续）/ aborted（任务终结）/ replanned（已生成并执行新计划）。
  private async handleFailure(
    state: CoordinationState,
    plan: TaskPlan,
    failedSubtask: SubTask,
    result: ExecutionResult,
    completedSubtasks: SubTask[],
    context?: Record<string, unknown> | null,
  ): Promise<FailureOutcome> {
    const strategy = failedSubtask.failure_strategy;

    if (strategy === FailureStrategy.SKIP) {
      this.logger.log(
        `Coordinator: skipping failed subtask ${failedSubtask.subtask_id}`,
      );
      failedSubtask.status = SubTaskStatus.SKIPPED;
      return 'continued';
    }

    if (strategy === FailureStrategy.ABORT) {
      this.logger.error(
        `Coordinator: aborting task ${state.task_id} at subtask ${failedSubtask.subtask_id}`,
      );
      state.status = CoordinationStatus.FAILED;
      state.error_message = `Sub-task ${failedSubtask.index} failed: ${result.error_message}`;
      return 'aborted';
    }

    if (strategy === FailureStrategy.REPLAN) {
      if (state.total_replans >= this.maxReplans) {
        this.logger.error(
          `Coordinator: max replans (${this.maxReplans}) reached for task ${state.task_id}`,
        );
        state.status = CoordinationStatus.NEEDS_HUMAN;
        state.error_message = `Max replans exceeded. Last failure: ${result.error_message}`;
        return 'aborted';
      }

      state.total_replans += 1;
      this.logger.log(
        `Coordinator: replanning task ${state.task_id} (attempt ${state.total_replans}/${this.maxReplans})`,
      );

      let newPlan: TaskPlan;
      try {
        newPlan = await this.planner.replan(
          state.navigation_goal,
          completedSubtasks,
          failedSubtask,
          result.error_message || 'Unknown error',
          context,
        );
      } catch (e) {
        this.logger.error(`Coordinator: replan failed: ${e}`);
        state.status = CoordinationStatus.NEEDS_HUMAN;
        state.error_message = `Replan failed: ${e instanceof Error ? e.message : String(e)}`;
        return 'aborted';
      }

      state.current_plan = newPlan;

      // 执行新计划（递归；递归深度由 max_replans ）
      await this.executePlan(state, newPlan, completedSubtasks, context);
      return 'replanned';
    }

    // 默认：RETRY 策略由 ExecutorAgent 内部消化。走到这里说明重试已耗尽。
    state.status = CoordinationStatus.FAILED;
    state.error_message = `Sub-task ${failedSubtask.index} failed after retries: ${result.error_message}`;
    return 'aborted';
  }
}
