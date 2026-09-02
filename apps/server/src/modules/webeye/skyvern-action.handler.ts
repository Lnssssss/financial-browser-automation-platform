// action_handler 的真实实现（A 段·等价迁移）。
//
// enterprise/agent/executor.py 的 action_handler 是与浏览器层的【唯一接缝】，这里填上真实实现：
// 把子任务目标交给 Skyvern 核心跑一次真实浏览器任务，轮询到终态后映射回 HandlerResult。
//
// 为什么轮询而非 webhook 回调：轮询实现自足，无需给 Skyvern 配回调地址、无需在 NestJS
// 暴露公网回调端点。权衡是有轮询延迟——但 action_handler 本就是"发起并等待结果"的同步语义，
// 轮询天然契合。见 ADR-005。

import { Logger } from '@nestjs/common';
import type { ActionHandler, HandlerResult } from '../agent/executor.service';
import { SkyvernTaskClient, isTerminalStatus } from './skyvern-task.client';

export interface SkyvernHandlerOptions {
  /// 轮询间隔（毫秒），默认 2s。
  pollIntervalMs?: number;
  /// 轮询总时限（毫秒），默认 5min。超时视为失败（避免 action_handler 永久挂起）。
  pollTimeoutMs?: number;
}

const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_POLL_TIMEOUT_MS = 5 * 60 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/// 构造一个把子任务桥接到 Skyvern Task API 的 action_handler。
/// context.url（若有）作为任务起始 URL 传入。
export function createSkyvernActionHandler(
  client: SkyvernTaskClient,
  opts: SkyvernHandlerOptions = {},
): ActionHandler {
  const logger = new Logger('SkyvernActionHandler');
  const intervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const timeoutMs = opts.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;

  return async (goal: string, context: Record<string, unknown>): Promise<HandlerResult> => {
    const url = typeof context.url === 'string' ? context.url : undefined;

    let taskId: string;
    try {
      taskId = await client.createTask({ prompt: goal, url });
    } catch (e) {
      // 创建失败直接作为一次失败返回，交给 Executor 的重试机制处理。
      return { success: false, error: `createTask failed: ${errMsg(e)}` };
    }

    const deadline = nowPlus(timeoutMs);
    // 单调计时：用相对步数而非绝对时钟判超时（context 里无起点，故用循环累计）。
    let elapsed = 0;
    while (elapsed <= timeoutMs) {
      let task;
      try {
        task = await client.getTask(taskId);
      } catch (e) {
        return { success: false, error: `getTask failed: ${errMsg(e)}` };
      }

      if (isTerminalStatus(task.status)) {
        if (task.status === 'completed') {
          logger.log(`Skyvern task ${taskId} completed`);
          return {
            success: true,
            data: (task.extracted_information as Record<string, unknown>) ?? null,
            page_url: task.request?.url ?? null,
          };
        }
        // failed / terminated / timed_out / canceled → 失败，带上 Skyvern 的失败原因。
        logger.warn(`Skyvern task ${taskId} ended as ${task.status}`);
        return {
          success: false,
          error: task.failure_reason ?? `Skyvern task ${task.status}`,
        };
      }

      await sleep(intervalMs);
      elapsed += intervalMs;
    }

    // 轮询超时：把仍未终结的任务视为失败（deadline 仅用于日志可读性）。
    logger.error(`Skyvern task ${taskId} poll timeout after ${timeoutMs}ms (deadline≈${deadline})`);
    return { success: false, error: `Skyvern task ${taskId} poll timeout` };
  };
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/// 仅用于日志展示的"截止点"描述，不参与判定（判定用循环累计 elapsed，避免依赖 Date.now 的可测性问题）。
function nowPlus(ms: number): string {
  return `+${Math.round(ms / 1000)}s`;
}
