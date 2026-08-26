// 审批通知的消息模板：把上下文渲染成企业微信 / 钉钉 webhook 的 JSON 载荷。
// 纯函数、无副作用、无 IO——只做「上下文 → 文本 → 载荷」的形状变换，便于单测覆盖。

import type { ApprovalNotificationContext } from './notification.types';

/// 风险等级到 emoji 的映射。未知等级在渲染处兜底为 ⚪。
export const RISK_EMOJI: Record<string, string> = {
  low: '🟢',
  medium: '🟡',
  high: '🟠',
  critical: '🔴',
};

/// 风险等级的中文标签。未知等级兜底为原始 level 字符串。
export const RISK_LABEL_CN: Record<string, string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
  critical: '严重风险',
};

/// 把秒数转成人类可读的超时文案：≥1 小时按小时，否则按分钟。
export function timeoutDisplay(seconds: number): string {
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    return `${hours} 小时`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes} 分钟`;
}

/// 渲染为 Markdown（企业微信 webhook 用）。
/// 企业微信只支持 Markdown 子集，故用其能识别的引用块/加粗/链接语法。
export function renderMarkdown(ctx: ApprovalNotificationContext): string {
  const emoji = RISK_EMOJI[ctx.riskLevel] ?? '⚪';
  const label = RISK_LABEL_CN[ctx.riskLevel] ?? ctx.riskLevel;

  const lines: string[] = [
    `### ${emoji} 审批请求 — ${label}`,
    '',
    `> **审批编号**: ${ctx.approvalId}`,
    `> **关联任务**: ${ctx.taskId}`,
    `> **所属部门**: ${ctx.departmentName}`,
  ];

  if (ctx.businessLineName) {
    lines.push(`> **业务线**: ${ctx.businessLineName}`);
  }

  lines.push('', `**风险原因**: ${ctx.riskReason}`);

  if (ctx.operationDescription) {
    lines.push(`**操作描述**: ${ctx.operationDescription}`);
  }

  if (ctx.screenshotUrl) {
    lines.push(`[查看操作截图](${ctx.screenshotUrl})`);
  }

  lines.push('', `⏱ 超时时间: **${timeoutDisplay(ctx.timeoutSeconds)}**`);

  if (ctx.approvalUrl) {
    lines.push(`[立即审批](${ctx.approvalUrl})`);
  }

  return lines.join('\n');
}

/// 构造企业微信 webhook 的 JSON 载荷（markdown 类型消息）。
export function renderWecomPayload(ctx: ApprovalNotificationContext): Record<string, unknown> {
  return {
    msgtype: 'markdown',
    markdown: {
      content: renderMarkdown(ctx),
    },
  };
}

/// 构造钉钉 webhook 的 JSON 载荷（actionCard 富交互消息）。
/// actionCard 支持单按钮跳转，singleURL 指向审批页；缺省时给空串（钉钉要求该字段存在）。
export function renderDingtalkPayload(ctx: ApprovalNotificationContext): Record<string, unknown> {
  const emoji = RISK_EMOJI[ctx.riskLevel] ?? '⚪';
  const label = RISK_LABEL_CN[ctx.riskLevel] ?? ctx.riskLevel;
  const title = `${emoji} 审批请求 — ${label}`;

  const textLines: string[] = [
    `### ${title}`,
    '',
    `- 审批编号: ${ctx.approvalId}`,
    `- 关联任务: ${ctx.taskId}`,
    `- 所属部门: ${ctx.departmentName}`,
  ];

  if (ctx.businessLineName) {
    textLines.push(`- 业务线: ${ctx.businessLineName}`);
  }

  textLines.push('', `**风险原因**: ${ctx.riskReason}`);

  if (ctx.operationDescription) {
    textLines.push(`**操作描述**: ${ctx.operationDescription}`);
  }

  if (ctx.screenshotUrl) {
    textLines.push(`[查看操作截图](${ctx.screenshotUrl})`);
  }

  textLines.push(`\n⏱ 超时时间: **${timeoutDisplay(ctx.timeoutSeconds)}**`);

  const text = textLines.join('\n');

  return {
    msgtype: 'actionCard',
    actionCard: {
      title,
      text,
      singleTitle: '立即审批',
      singleURL: ctx.approvalUrl ?? '',
    },
  };
}
