// ExecutorAgent：执行计划中的单个子任务 + 重试。
// 注入 action_handler（(goal, context) => Promise<HandlerResult>），生产环境会包裹
// Skyvern 的感知-动作循环。这是与浏览器层的【唯一接缝】——现在未接线，注入 null
// 时走 simulateExecution。重试在 Executor 内部消化，Coordinator 只看到最终成败。

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ExecutionResult, SubTask, SubTaskStatus } from './schemas';

/// action_handler 的返回形状。
export interface HandlerResult {
  success: boolean;
  data?: Record<string, unknown> | null;
  error?: string | null;
  screenshot_key?: string | null;
  page_url?: string | null;
}

/// 注入的动作处理器。
export type ActionHandler = (
  goal: string,
  context: Record<string, unknown>,
) => Promise<HandlerResult>;

export const ACTION_HANDLER = Symbol('ACTION_HANDLER');

@Injectable()
export class ExecutorService {
  private readonly logger = new Logger(ExecutorService.name);
  private readonly actionHandler: ActionHandler | null;

  constructor(@Optional() @Inject(ACTION_HANDLER) handler?: ActionHandler | null) {
    this.actionHandler = handler ?? null;
  }

  /// 带重试地执行一个子任务。
  async executeSubtask(
    subtask: SubTask,
    context?: Record<string, unknown> | null,
  ): Promise<ExecutionResult> {
    subtask.status = SubTaskStatus.RUNNING;
    subtask.started_at = new Date();

    // 单调时钟计时（不受系统时钟回拨影响）。
    const start = performance.now();
    let lastError: string | null = null;

    for (let attempt = 0; attempt <= subtask.max_retries; attempt++) {
      try {
        const handlerResult = this.actionHandler
          ? await this.actionHandler(subtask.goal, context ?? {})
          : this.simulateExecution(subtask);

        const elapsed = Math.trunc(performance.now() - start);

        if (handlerResult.success) {
          subtask.status = SubTaskStatus.COMPLETED;
          subtask.completed_at = new Date();
          subtask.result_data = handlerResult.data ?? null;

          this.logger.log(
            `ExecutorAgent: subtask ${subtask.subtask_id} completed in ${elapsed}ms (attempt ${attempt + 1})`,
          );
          return {
            subtask_id: subtask.subtask_id,
            success: true,
            result_data: handlerResult.data ?? null,
            screenshot_key: handlerResult.screenshot_key ?? null,
            page_url: handlerResult.page_url ?? null,
            duration_ms: elapsed,
          };
        }

        lastError = handlerResult.error ?? 'Unknown error';
        this.logger.warn(
          `ExecutorAgent: subtask ${subtask.subtask_id} attempt ${attempt + 1} failed: ${lastError}`,
        );
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        this.logger.warn(
          `ExecutorAgent: subtask ${subtask.subtask_id} attempt ${attempt + 1} exception: ${lastError}`,
        );
      }

      if (attempt < subtask.max_retries) {
        this.logger.log(
          `ExecutorAgent: retrying subtask ${subtask.subtask_id} (${attempt + 2}/${subtask.max_retries + 1})`,
        );
      }
    }

    // 重试全部耗尽
    const elapsed = Math.trunc(performance.now() - start);
    subtask.status = SubTaskStatus.FAILED;
    subtask.completed_at = new Date();
    subtask.error_message = lastError;

    this.logger.error(
      `ExecutorAgent: subtask ${subtask.subtask_id} failed after ${subtask.max_retries + 1} attempts: ${lastError}`,
    );
    return {
      subtask_id: subtask.subtask_id,
      success: false,
      error_message: lastError,
      duration_ms: elapsed,
    };
  }

  /// 无 action_handler 时的模拟执行（测试/开发用）。
  private simulateExecution(subtask: SubTask): HandlerResult {
    return {
      success: true,
      data: { goal: subtask.goal, simulated: true },
    };
  }
}
