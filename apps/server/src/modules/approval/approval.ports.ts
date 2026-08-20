// 审批等待机制的两个注入点。设计见 ADR-004。
//
// "存状态 + 事件恢复"：这两个接口就是与真实队列基础设施的接缝，现在未接线（Optional），
// Stage 4 接 BullMQ 时 provide 实现。

/// 安排审批超时检查。真实实现 = 投一个 delay=timeoutSeconds 的 BullMQ 延迟任务，
/// 到点检查记录是否仍 PENDING，是则置 TIMEOUT。未接线时为 no-op。
export interface ApprovalTimeoutScheduler {
  schedule(approvalId: string, timeoutSeconds: number): Promise<void>;
}
export const APPROVAL_TIMEOUT_SCHEDULER = Symbol('APPROVAL_TIMEOUT_SCHEDULER');

/// 决策到达时恢复被挂起的任务。真实实现 = 把任务重新入 executor-queue。未接线时为 no-op。
export interface ApprovalResumeHandler {
  resume(approvalId: string, decision: 'approved' | 'rejected' | 'timeout'): Promise<void>;
}
export const APPROVAL_RESUME_HANDLER = Symbol('APPROVAL_RESUME_HANDLER');
