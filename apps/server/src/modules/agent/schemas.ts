// 多 Agent 编排的运行时数据模型。逐条对齐 enterprise/agent/schemas.py。
// 这些是【运行时内部状态】（Coordinator 在内存里读写），不是 HTTP 入参，
// 所以用普通 class + 构造器默认值，而非 class-validator DTO。

import { randomUUID } from 'crypto';

/// 子任务失败时怎么办。
/// 值保持小写字符串，与 LLM 输出的 JSON（failure_strategy: "abort"）直接对齐。
export enum FailureStrategy {
  RETRY = 'retry',
  SKIP = 'skip',
  ABORT = 'abort',
  REPLAN = 'replan', // 让 Planner 重新规划剩余步骤
}

/// 单个子任务的执行状态。
export enum SubTaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
  REPLANNED = 'replanned', // 被新计划替换
}

/// 整体协调状态。
export enum CoordinationStatus {
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  NEEDS_HUMAN = 'needs_human',
}

/// 生成带前缀的短 id。
function shortId(prefix: string): string {
  return `${prefix}${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

/// PlannerAgent 产出的计划中的一个步骤。
export class SubTask {
  subtask_id: string;
  index: number;
  goal: string;
  completion_condition: string;
  max_retries: number;
  failure_strategy: FailureStrategy;
  status: SubTaskStatus;
  error_message: string | null;
  result_data: Record<string, unknown> | null;
  started_at: Date | null;
  completed_at: Date | null;

  constructor(init: {
    index: number;
    goal: string;
    completion_condition: string;
    max_retries?: number;
    failure_strategy?: FailureStrategy;
    status?: SubTaskStatus;
  }) {
    this.subtask_id = shortId('sub_');
    this.index = init.index;
    this.goal = init.goal;
    this.completion_condition = init.completion_condition;
    this.max_retries = init.max_retries ?? 2;
    this.failure_strategy = init.failure_strategy ?? FailureStrategy.REPLAN;
    this.status = init.status ?? SubTaskStatus.PENDING;
    this.error_message = null;
    this.result_data = null;
    this.started_at = null;
    this.completed_at = null;
  }
}

/// PlannerAgent 产出的完整计划。
export class TaskPlan {
  plan_id: string;
  navigation_goal: string;
  subtasks: SubTask[];
  created_at: Date;
  is_replan: boolean;
  replan_reason: string | null;
  version: number;

  constructor(init: {
    navigation_goal: string;
    subtasks?: SubTask[];
    is_replan?: boolean;
    replan_reason?: string | null;
    version?: number;
  }) {
    this.plan_id = shortId('plan_');
    this.navigation_goal = init.navigation_goal;
    this.subtasks = init.subtasks ?? [];
    this.created_at = new Date();
    this.is_replan = init.is_replan ?? false;
    this.replan_reason = init.replan_reason ?? null;
    this.version = init.version ?? 1;
  }
}

/// ExecutorAgent 执行单个子任务的结果。
export interface ExecutionResult {
  subtask_id: string;
  success: boolean;
  result_data?: Record<string, unknown> | null;
  error_message?: string | null;
  screenshot_key?: string | null; // MinIO key（只存 key 不存二进制）
  page_url?: string | null;
  duration_ms?: number | null;
}

/// Planner-Executor 协调的整体状态。
export class CoordinationState {
  task_id: string;
  org_id: string;
  navigation_goal: string;
  current_plan: TaskPlan | null;
  completed_subtasks: string[]; // 只存已完成子任务的 ID（供断点续跑）
  total_replans: number;
  max_replans: number;
  status: CoordinationStatus;
  error_message: string | null;

  constructor(init: {
    task_id: string;
    org_id: string;
    navigation_goal: string;
    completed_subtasks?: string[];
    max_replans?: number;
  }) {
    this.task_id = init.task_id;
    this.org_id = init.org_id;
    this.navigation_goal = init.navigation_goal;
    this.current_plan = null;
    this.completed_subtasks = init.completed_subtasks ?? [];
    this.total_replans = 0;
    this.max_replans = init.max_replans ?? 3;
    this.status = CoordinationStatus.RUNNING;
    this.error_message = null;
  }
}
