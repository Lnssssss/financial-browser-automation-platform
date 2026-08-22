import { randomBytes } from 'crypto';

// 审计日志的动作类型 + ID 生成。纯常量/纯函数，无副作用、无 DI。

/// 审计记录里的浏览器动作类型。字符串字面量联合替代 TS enum：
/// 序列化就是自身、比对无需 .value、和 DB 里存的字符串天然一致。
export type ActionType =
  | 'click'
  | 'input_text'
  | 'select_option'
  | 'upload_file'
  | 'navigate'
  | 'download'
  | 'screenshot'
  | 'wait'
  | 'scroll'
  | 'custom';

/// 全部合法动作类型（运行时可枚举，测试/校验用）。
export const ACTION_TYPES: readonly ActionType[] = [
  'click',
  'input_text',
  'select_option',
  'upload_file',
  'navigate',
  'download',
  'screenshot',
  'wait',
  'scroll',
  'custom',
];

export const AUDIT_LOG_PREFIX = 'aud';

/// 生成带 aud_ 前缀的审计日志 ID。
export function generateAuditLogId(): string {
  return `${AUDIT_LOG_PREFIX}_${randomBytes(12).toString('hex')}`;
}
