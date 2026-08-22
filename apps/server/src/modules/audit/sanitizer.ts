import { createHash } from 'crypto';

// 审计输入脱敏。写入审计存储前，按规则把敏感信息掩码：
// - 银行卡号：只留后 4 位（"************1234"）
// - 密码：整段掩码
// - 身份证号：只留后 4 位
// - 手机号：中间 4 位掩码
// - 金额：保留（业务关键，不脱敏）
// 规则用正则驱动、按顺序依次套用，可扩展。

/// 一条脱敏规则。pattern 用 g 全局标志，
/// replace 接收整段匹配和捕获组，返回掩码结果。
export interface SanitizationRule {
  name: string;
  pattern: RegExp;
  replace: (match: string, ...groups: string[]) => string;
}

/// 银行卡号：去掉空格/横线后只留后 4 位。
function maskCardNumber(match: string): string {
  const full = match.replace(/[\s-]/g, '');
  if (full.length < 4) return '****';
  return '*'.repeat(full.length - 4) + full.slice(-4);
}

/// 密码：保留关键词、值整段替换为 ********（值本身不落任何痕迹）。
function maskPassword(_match: string, keyword: string): string {
  return keyword + '********';
}

/// 身份证号：只留后 4 位。
function maskIdNumber(match: string): string {
  if (match.length <= 4) return '****';
  return '*'.repeat(match.length - 4) + match.slice(-4);
}

/// 手机号：保留前 3 + 后 4，中间掩码。
function maskPhone(match: string): string {
  if (match.length >= 11) return match.slice(0, 3) + '****' + match.slice(-4);
  return match.length > 4 ? '****' + match.slice(-4) : '****';
}

/// 默认规则，按此顺序依次套用。g 标志确保替换所有匹配；i 标志对齐 re.IGNORECASE。
export const DEFAULT_RULES: SanitizationRule[] = [
  {
    name: 'password',
    // 捕获组 1 = 关键词，值（\S+）整段被替换掉。
    pattern: /(password|passwd|pwd|密码|口令)\s*[:=：]\s*\S+/gi,
    replace: maskPassword,
  },
  {
    name: 'card_number',
    pattern: /\b[3-6]\d{3}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    replace: maskCardNumber,
  },
  {
    name: 'id_number',
    // 18 位中国身份证：省份码 + 出生年月日 + 顺序码 + 校验位(数字或 X)。
    pattern: /\b[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g,
    replace: maskIdNumber,
  },
  {
    name: 'phone',
    pattern: /\b1[3-9]\d{9}\b/g,
    replace: maskPhone,
  },
];

/// 对一个输入值套用脱敏规则。null 原样返回。
export function sanitizeInput(
  value: string | null,
  rules: SanitizationRule[] = DEFAULT_RULES,
): string | null {
  if (value === null) return null;
  let result = value;
  for (const rule of rules) {
    // 每次替换前重置 lastIndex：带 g 的正则是有状态的，复用同一 RegExp 对象需归零，
    // 否则上一轮 exec/replace 残留的 lastIndex 会让本轮从中途开始、漏匹配。
    rule.pattern.lastIndex = 0;
    result = result.replace(rule.pattern, rule.replace as (substring: string, ...args: unknown[]) => string);
  }
  return result;
}

/// 计算原值的 SHA-256（十六进制），用于完整性校验：
/// 不存明文也能证明原值未被篡改。null 原样返回。
export function hashRawValue(value: string | null): string | null {
  if (value === null) return null;
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
