// Skyvern 核心 Task API 的最小 HTTP 客户端。
//
// 铁律：浏览器执行层（skyvern/webeye + forge）原样保留 Python，NestJS 通过 HTTP 调用它。
// 这里只封装两个端点，不重写任何感知-动作逻辑：
//   - POST /run/tasks/     创建一个浏览器任务（body: TaskRunRequest{ prompt, url? }）→ 返回 task_id
//   - GET  /tasks/{id}/    查询任务状态（TaskResponse{ status, ... }）

import { Injectable, Logger } from '@nestjs/common';

/// Skyvern 任务的终态集合（对齐 skyvern TaskStatus.is_final）。
export const SKYVERN_TERMINAL_STATUSES = [
  'completed',
  'failed',
  'terminated',
  'timed_out',
  'canceled',
] as const;

export type SkyvernTaskStatus =
  | 'created'
  | 'queued'
  | 'running'
  | (typeof SKYVERN_TERMINAL_STATUSES)[number];

/// GET /tasks/{id}/ 关心的字段（TaskResponse 很大，只取桥接需要的）。
export interface SkyvernTask {
  task_id: string;
  status: SkyvernTaskStatus;
  extracted_information?: unknown;
  failure_reason?: string | null;
  request?: { url?: string | null } | null;
}

/// 创建任务的最小入参。engine 默认走 skyvern_v1（对齐 action_handler 的单目标语义）。
export interface CreateTaskInput {
  prompt: string;
  url?: string | null;
}

@Injectable()
export class SkyvernTaskClient {
  private readonly logger = new Logger(SkyvernTaskClient.name);

  /// 读环境变量。缺失时 fail-fast 抛错——桥接是真实基础设施接线，
  /// 静默降级会让"任务假装成功"，比直接报错危险得多（区别于缓存的优雅降级）。
  private baseUrl(): string {
    const url = process.env.SKYVERN_BASE_URL;
    if (!url) {
      throw new Error(
        'SKYVERN_BASE_URL 未配置：webeye 桥接需要指向 Skyvern 服务的地址',
      );
    }
    return url.replace(/\/+$/, '');
  }

  private apiKey(): string {
    const key = process.env.SKYVERN_API_KEY;
    if (!key) {
      throw new Error('SKYVERN_API_KEY 未配置：调用 Skyvern Task API 需要 x-api-key');
    }
    return key;
  }

  /// 创建一个浏览器任务，返回 Skyvern 侧的 task_id。
  async createTask(input: CreateTaskInput): Promise<string> {
    const res = await fetch(`${this.baseUrl()}/run/tasks/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey(),
      },
      body: JSON.stringify({
        prompt: input.prompt,
        url: input.url ?? undefined,
        engine: 'skyvern_v1',
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Skyvern createTask 失败 ${res.status}: ${text}`);
    }
    const body = (await res.json()) as { task_id?: string; run_id?: string };
    // run_task 返回体历史上用过 run_id/task_id，两者取其一（task_v1 用 task_id）。
    const taskId = body.task_id ?? body.run_id;
    if (!taskId) {
      throw new Error(`Skyvern createTask 响应缺少 task_id: ${JSON.stringify(body)}`);
    }
    this.logger.log(`Skyvern task created: ${taskId} (prompt="${input.prompt.slice(0, 60)}")`);
    return taskId;
  }

  /// 查询任务当前状态。
  async getTask(taskId: string): Promise<SkyvernTask> {
    const res = await fetch(`${this.baseUrl()}/tasks/${taskId}/`, {
      method: 'GET',
      headers: { 'x-api-key': this.apiKey() },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Skyvern getTask 失败 ${res.status}: ${text}`);
    }
    return (await res.json()) as SkyvernTask;
  }
}

/// 判断状态是否为终态。
export function isTerminalStatus(status: SkyvernTaskStatus): boolean {
  return (SKYVERN_TERMINAL_STATUSES as readonly string[]).includes(status);
}
