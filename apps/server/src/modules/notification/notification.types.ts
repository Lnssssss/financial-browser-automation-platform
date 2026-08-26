// 通知系统的类型定义。集中放渠道、发送结果、模板上下文、投递记录几组形状。
// 这些不是 Prisma 实体：ApprovalNotificationContext 是审批流程喂进来的上下文，
// WebhookConfig 是每个用户的 webhook 地址配置，NotificationAttempt 是审计用的单次投递记录。

/// 支持的通知渠道。用字符串字面量联合，值即对外契约里的 channel 字段。
export type ChannelType = 'wecom' | 'dingtalk';

export const CHANNEL_WECOM: ChannelType = 'wecom';
export const CHANNEL_DINGTALK: ChannelType = 'dingtalk';

/// 单次发送尝试的结果。success 是唯一的成败判据，其余字段用于排障/审计。
export interface SendResult {
  success: boolean;
  channel: string;
  statusCode?: number | null;
  error?: string | null;
  responseBody?: string | null;
}

/// 渲染审批通知消息所需的上下文。字段与审批领域一一对应。
/// screenshotUrl 是 MinIO 预签名地址；带 ? 的字段允许缺省，渲染时按需省略对应段落。
export interface ApprovalNotificationContext {
  approvalId: string;
  taskId: string;
  riskLevel: string;
  riskReason: string;
  departmentName: string;
  businessLineName?: string | null;
  operationDescription?: string | null;
  screenshotUrl?: string | null; // MinIO 预签名 URL
  approvalUrl?: string | null;
  timeoutSeconds: number;
  approverName?: string | null;
}

/// 单个用户的 webhook 配置。两条渠道地址都可缺省——缺省即该渠道不可用。
export interface WebhookConfig {
  userId: string;
  wecomUrl?: string | null;
  dingtalkUrl?: string | null;
}

/// 一次通知投递的审计记录。timestamp 在创建时自动补全（见 makeAttempt）。
export interface NotificationAttempt {
  approvalId: string;
  targetUserId: string;
  channel: string;
  success: boolean;
  error?: string | null;
  timestamp: string;
}
