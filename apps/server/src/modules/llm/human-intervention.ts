// NEEDS_HUMAN 状态处理与人工介入决策。
// AI 三层容错耗尽后任务转 needs_human，操作员在此对卡住的任务做三选一处置。
// 纯逻辑：数据结构 + resolveStuckTask 决策分派，无 DI、无 IO。

/// 操作员对 needs_human 任务可采取的处置动作。字面量联合，值即协议字符串。
export type ResolutionAction =
  | 'skip_step' // 跳过该步继续
  | 'manual_complete' // 标记该步为人工已完成
  | 'terminate'; // 终止任务

/// 一个卡在 needs_human 的任务的现场信息（供人工排查）。
export interface StuckTaskInfo {
  task_id: string;
  org_id: string;
  department_id: string;
  stuck_action_index: number;
  stuck_action_type: string;
  page_url: string | null;
  screenshot_key: string | null;
  llm_errors: string[];
  llm_raw_response: string | null;
  stuck_since: string; // ISO 8601
  total_actions: number;
  completed_actions: number;
}

/// 人工操作员做出的处置。
export interface HumanResolution {
  task_id: string;
  action: ResolutionAction;
  resolved_by: string; // user_id
  note?: string;
  manual_result?: Record<string, unknown> | null; // 仅 manual_complete 用
  resolved_at?: string;
}

/// 构造 HumanResolution，补齐 resolved_at 缺省。
/// 这里是普通运行时代码，new Date() 正常可用。
export function makeResolution(input: HumanResolution): HumanResolution {
  return {
    ...input,
    note: input.note ?? '',
    resolved_at: input.resolved_at || new Date().toISOString(),
  };
}

/// 处置结果：新状态 + 恢复指令（下一步从哪个 action 继续）。
export interface ResolutionResult {
  task_id: string;
  new_status: string;
  resume_from_action?: number;
  resolution: ResolutionAction;
  manual_result?: Record<string, unknown> | null;
  resolved_by: string;
}

/// 处理一个卡住任务的人工处置，返回新状态与下一步指令。
///   - skip_step / manual_complete：转 running，从 stuck_action_index+1 继续
///   - terminate：转 terminated
///   - 未知动作：抛错（防御非法枚举值）
export function resolveStuckTask(
  taskInfo: StuckTaskInfo,
  resolution: HumanResolution,
): ResolutionResult {
  if (resolution.action === 'skip_step') {
    return {
      task_id: taskInfo.task_id,
      new_status: 'running',
      resume_from_action: taskInfo.stuck_action_index + 1,
      resolution: 'skip_step',
      resolved_by: resolution.resolved_by,
    };
  }

  if (resolution.action === 'manual_complete') {
    return {
      task_id: taskInfo.task_id,
      new_status: 'running',
      resume_from_action: taskInfo.stuck_action_index + 1,
      resolution: 'manual_complete',
      manual_result: resolution.manual_result ?? null,
      resolved_by: resolution.resolved_by,
    };
  }

  if (resolution.action === 'terminate') {
    return {
      task_id: taskInfo.task_id,
      new_status: 'terminated',
      resolution: 'terminate',
      resolved_by: resolution.resolved_by,
    };
  }

  throw new Error(`Unknown resolution action: ${String(resolution.action)}`);
}
