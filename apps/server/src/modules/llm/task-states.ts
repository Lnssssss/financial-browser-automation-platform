// 企业级任务状态机。在 Skyvern 基础生命周期上追加三个企业态：
//   - pending_approval：任务被审批流挂起，等人决策
//   - needs_human：AI 三层容错耗尽仍失败，交人工介入
//   - paused：操作员手动暂停
// 纯逻辑：状态枚举 + 合法转换表 + 转换校验。无 DI、无 IO。

/// 完整任务状态（Skyvern 基础态 + 企业扩展态）。
/// 用字符串字面量联合而非 TS enum：状态值直接和 DB/DTO 里的字符串比较，零转换。
export type EnterpriseTaskStatus =
  // --- Skyvern 基础态 ---
  | 'created'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'terminated'
  | 'timed_out'
  | 'canceled'
  // --- 企业扩展态 ---
  | 'pending_approval'
  | 'needs_human'
  | 'paused';

/// 合法状态转换表：current -> 允许进入的状态集合。
/// 终态映射到空集（无出边）。表里没登记的 current 视为无任何合法出边。
export const VALID_TRANSITIONS: Record<string, ReadonlySet<string>> = {
  created: new Set(['queued', 'canceled']),
  queued: new Set(['running', 'canceled']),
  running: new Set([
    'completed',
    'failed',
    'terminated',
    'timed_out',
    'pending_approval',
    'needs_human',
    'paused',
  ]),
  pending_approval: new Set([
    'running', // 通过 -> 恢复执行
    'terminated', // 驳回
    'timed_out', // 审批超时
  ]),
  needs_human: new Set([
    'running', // 人工跳过/完成该步
    'terminated', // 人工终止
  ]),
  paused: new Set([
    'running', // 恢复
    'terminated', // 暂停中终止
  ]),
  // 终态 —— 无出边
  completed: new Set(),
  failed: new Set(),
  terminated: new Set(),
  timed_out: new Set(),
  canceled: new Set(),
};

/// 终态集合：一旦进入不可再流转。
export const TERMINAL_STATES: ReadonlySet<string> = new Set([
  'completed',
  'failed',
  'terminated',
  'timed_out',
  'canceled',
]);

/// 需要人工关注的状态集合（前端红点/工单入口用）。
export const HUMAN_ATTENTION_STATES: ReadonlySet<string> = new Set([
  'pending_approval',
  'needs_human',
  'paused',
]);

/// 非法状态转换异常。current/target 存字段，便于上层映射 HTTP 或日志。
export class InvalidTransitionError extends Error {
  constructor(
    public readonly currentState: string,
    public readonly targetState: string,
  ) {
    super(`Invalid state transition: ${currentState} -> ${targetState}`);
    this.name = 'InvalidTransitionError';
  }
}

/// 校验一次状态转换是否合法。
/// 合法返回 true；非法抛 InvalidTransitionError（与源码"抛异常而非返 false"一致，
/// 让非法流转在调用点显式炸出、不被静默忽略）。
export function validateTransition(currentState: string, targetState: string): boolean {
  const allowed = VALID_TRANSITIONS[currentState] ?? new Set<string>();
  if (!allowed.has(targetState)) {
    throw new InvalidTransitionError(currentState, targetState);
  }
  return true;
}
