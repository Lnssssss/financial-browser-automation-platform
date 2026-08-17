// PlannerAgent：把导航目标拆解成有序子任务计划。逐行迁自 enterprise/agent/planner.py。
//
// 注入一个 LlmCallable（(prompt) => Promise<string>），不绑定具体 LLM SDK——
// 这是源码设计精华：核心逻辑对"用哪个 LLM"无感知，所以全套逻辑可用 mock 覆盖单测。
// 注入点可为 null（走 fallback 单步计划），忠实保留源码 llm_callable=None 的语义。

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { FailureStrategy, SubTask, TaskPlan } from './schemas';

/// 注入的 LLM 调用函数。源码 llm_callable: async (prompt: str) -> str。
export type LlmCallable = (prompt: string) => Promise<string>;

/// DI token：Stage 4 接真实 LLM 时在 module 里 provide 真实实现；
/// 现在未接线，Optional 缺省为 undefined → 归一成 null → 走 fallback。
export const LLM_CALLABLE = Symbol('LLM_CALLABLE');

const PLANNER_SYSTEM_PROMPT = `You are a financial RPA planning agent. Your job is to decompose a navigation goal into a sequence of concrete sub-tasks that a browser automation executor can perform step by step.

Each sub-task must have:
- "goal": a clear, actionable description of what to do
- "completion_condition": how to verify success (e.g. "page URL contains /dashboard")
- "failure_strategy": one of "retry", "skip", "abort", "replan"
- "max_retries": integer (default 2)

Output ONLY a JSON object with a "steps" array. No other text.

Example:
{
  "steps": [
    {"goal": "Login to the system", "completion_condition": "URL contains /home", "failure_strategy": "abort", "max_retries": 3},
    {"goal": "Navigate to account page", "completion_condition": "Page title contains Account", "failure_strategy": "replan", "max_retries": 2}
  ]
}
`;

const REPLAN_SYSTEM_PROMPT = `You are a financial RPA planning agent. A previous plan failed at a specific step. You are given the original goal, the steps completed so far, and the failure details. Generate a REVISED plan for the remaining steps only. Do NOT repeat already-completed steps.

Output ONLY a JSON object with a "steps" array.
`;

/// 把 LLM 返回的字符串解析成 failure_strategy 枚举。
/// 对齐源码 FailureStrategy(...)：非法值【抛错】，由上层 catch 走 fallback。
function toFailureStrategy(value: unknown): FailureStrategy {
  const v = String(value ?? 'replan');
  const all = Object.values(FailureStrategy) as string[];
  if (!all.includes(v)) {
    throw new Error(`Invalid failure_strategy: ${v}`);
  }
  return v as FailureStrategy;
}

interface RawStep {
  goal?: string;
  completion_condition?: string;
  max_retries?: number;
  failure_strategy?: string;
}

@Injectable()
export class PlannerService {
  private readonly logger = new Logger(PlannerService.name);
  private readonly llm: LlmCallable | null;

  constructor(@Optional() @Inject(LLM_CALLABLE) llm?: LlmCallable | null) {
    this.llm = llm ?? null;
  }

  /// 从导航目标生成初始计划。有 llm 走 LLM，否则回退单步计划。
  async createPlan(
    navigationGoal: string,
    context?: Record<string, unknown> | null,
  ): Promise<TaskPlan> {
    if (this.llm) {
      return this.planWithLlm(navigationGoal, context);
    }
    return this.createFallbackPlan(navigationGoal);
  }

  /// 子任务失败后生成修订计划（只规划剩余步骤）。
  async replan(
    originalGoal: string,
    completedSubtasks: SubTask[],
    failedSubtask: SubTask,
    failureReason: string,
    context?: Record<string, unknown> | null,
  ): Promise<TaskPlan> {
    if (this.llm) {
      return this.replanWithLlm(
        originalGoal,
        completedSubtasks,
        failedSubtask,
        failureReason,
        context,
      );
    }

    // Fallback：跳过失败步骤，生成一个继续计划
    return new TaskPlan({
      navigation_goal: originalGoal,
      subtasks: [
        new SubTask({
          index: 0,
          goal: `Continue after failure: ${originalGoal}`,
          completion_condition: 'Task goal achieved',
          failure_strategy: FailureStrategy.ABORT,
        }),
      ],
      is_replan: true,
      replan_reason: failureReason,
      version: completedSubtasks.length + 2,
    });
  }

  /// 去掉 LLM 输出的 markdown 代码围栏。对齐源码 planner.py:151-154。
  private stripCodeFence(raw: string): string {
    const cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      const lines = cleaned.split('\n');
      return lines.slice(1, -1).join('\n');
    }
    return cleaned;
  }

  private async planWithLlm(
    navigationGoal: string,
    context?: Record<string, unknown> | null,
  ): Promise<TaskPlan> {
    const ctxStr = context ? JSON.stringify(context) : 'No additional context.';
    const prompt =
      `${PLANNER_SYSTEM_PROMPT}\n\n` +
      `## Navigation Goal\n${navigationGoal}\n\n` +
      `## Context\n${ctxStr}\n`;

    try {
      const raw = await this.llm!(prompt);
      const cleaned = this.stripCodeFence(raw);
      const data = JSON.parse(cleaned) as { steps?: RawStep[] };

      const steps = data.steps ?? [];
      const subtasks = steps.map(
        (step, i) =>
          new SubTask({
            index: i,
            goal: step.goal ?? `Step ${i + 1}`,
            completion_condition: step.completion_condition ?? '',
            max_retries: step.max_retries ?? 2,
            failure_strategy: toFailureStrategy(step.failure_strategy),
          }),
      );

      const plan = new TaskPlan({ navigation_goal: navigationGoal, subtasks });
      this.logger.log(
        `PlannerAgent: created plan with ${subtasks.length} sub-tasks for: ${navigationGoal}`,
      );
      return plan;
    } catch (e) {
      // 失败即降级：LLM 报错或 JSON 解析失败 → 回退单步计划，不抛异常（三层容错第一层）
      this.logger.warn(
        `PlannerAgent: LLM planning failed (${e}), using fallback`,
      );
      return this.createFallbackPlan(navigationGoal);
    }
  }

  private async replanWithLlm(
    originalGoal: string,
    completedSubtasks: SubTask[],
    failedSubtask: SubTask,
    failureReason: string,
    context?: Record<string, unknown> | null,
  ): Promise<TaskPlan> {
    const completedSummary = completedSubtasks
      .map((s) => `- Step ${s.index}: ${s.goal} [COMPLETED]`)
      .join('\n');
    const prompt =
      `${REPLAN_SYSTEM_PROMPT}\n\n` +
      `## Original Goal\n${originalGoal}\n\n` +
      `## Completed Steps\n${completedSummary || 'None'}\n\n` +
      `## Failed Step\nStep ${failedSubtask.index}: ${failedSubtask.goal}\n` +
      `Failure reason: ${failureReason}\n\n` +
      `## Context\n${context ? JSON.stringify(context) : 'None'}\n`;

    try {
      const raw = await this.llm!(prompt);
      const cleaned = this.stripCodeFence(raw);
      const data = JSON.parse(cleaned) as { steps?: RawStep[] };

      const steps = data.steps ?? [];
      const subtasks = steps.map(
        (step, i) =>
          new SubTask({
            // 关键：续跑索引从已完成数量接着排，不从 0 开始
            index: completedSubtasks.length + i,
            goal: step.goal ?? `Step ${i + 1}`,
            completion_condition: step.completion_condition ?? '',
            max_retries: step.max_retries ?? 2,
            failure_strategy: toFailureStrategy(step.failure_strategy),
          }),
      );

      const plan = new TaskPlan({
        navigation_goal: originalGoal,
        subtasks,
        is_replan: true,
        replan_reason: failureReason,
        version: completedSubtasks.length + 2,
      });
      this.logger.log(
        `PlannerAgent: replanned with ${subtasks.length} new sub-tasks (reason: ${failureReason.slice(0, 80)})`,
      );
      return plan;
    } catch (e) {
      this.logger.warn(`PlannerAgent: LLM replan failed (${e}), using fallback`);
      return new TaskPlan({
        navigation_goal: originalGoal,
        subtasks: [
          new SubTask({
            index: completedSubtasks.length,
            goal: `Continue after failure: ${originalGoal}`,
            completion_condition: 'Task goal achieved',
            failure_strategy: FailureStrategy.ABORT,
          }),
        ],
        is_replan: true,
        replan_reason: failureReason,
        version: completedSubtasks.length + 2,
      });
    }
  }

  /// 单步计划（无需 LLM）。源码 _create_fallback_plan。
  private createFallbackPlan(navigationGoal: string): TaskPlan {
    return new TaskPlan({
      navigation_goal: navigationGoal,
      subtasks: [
        new SubTask({
          index: 0,
          goal: navigationGoal,
          completion_condition: 'Navigation goal achieved',
          failure_strategy: FailureStrategy.ABORT,
          max_retries: 3,
        }),
      ],
    });
  }
}
