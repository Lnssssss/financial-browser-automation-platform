// 工作流参数校验。把用户提交的参数对照模板定义逐项检查：
// - 必填项是否缺失（有 default 的不算缺）
// - 类型格式（整数 / 日期 / URL / 邮箱）
// - 敏感项（密码非空）
// - 业务规则（日期区间不超过 12 个月、结束不早于开始）
//
// 纯函数、无状态、无副作用——同 approval 的 risk-keywords，极易测。

import { ParamDefinition, ParamType } from './workflow.schemas';

export const MAX_DATE_RANGE_DAYS = 365; // 最多 12 个月

/// 单条校验错误。
export interface ValidationError {
  param_name: string;
  message: string;
}

/// 校验结果。
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// 格式校验正则
const URL_PATTERN = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
// 结构正则：先卡 YYYY-MM-DD 形状（月 01-12、日 01-31），真实合法性（如 2 月 30 日）再由 parseDate 兜底。
const DATE_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

/// 解析 YYYY-MM-DD 为真实日期，非法（如 2026-02-30）返回 null。
/// 用 UTC 构造再回读三个分量比对，捕获 JS Date 的"自动进位"（2 月 30 日会变 3 月 2 日）。
function parseDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null; // 发生进位 = 非法日期
  }
  return d;
}

/// 校验单个值是否符合声明的类型。返回错误或 null。
function validateType(
  name: string,
  value: string,
  paramType: ParamType,
): ValidationError | null {
  switch (paramType) {
    case 'integer': {
      // 整数：必须是纯整数字符串（Number 对 "12abc" 会得 NaN，对 "1.5" 非整）
      if (!/^-?\d+$/.test(value)) {
        return { param_name: name, message: `Expected integer, got '${value}'` };
      }
      return null;
    }
    case 'date': {
      if (!DATE_PATTERN.test(value)) {
        return { param_name: name, message: `Expected date format YYYY-MM-DD, got '${value}'` };
      }
      if (parseDate(value) === null) {
        return { param_name: name, message: `Invalid date: '${value}'` };
      }
      return null;
    }
    case 'url':
      if (!URL_PATTERN.test(value)) {
        return { param_name: name, message: `Invalid URL format: '${value}'` };
      }
      return null;
    case 'email':
      if (!EMAIL_PATTERN.test(value)) {
        return { param_name: name, message: `Invalid email format: '${value}'` };
      }
      return null;
    case 'password':
      if (value.length < 1) {
        return { param_name: name, message: 'Password cannot be empty' };
      }
      return null;
    default:
      return null;
  }
}

/// 按模板声明的自定义正则校验。正则本身非法也报错（模板配置问题）。
function validateCustomRegex(
  name: string,
  value: string,
  pattern: string,
): ValidationError | null {
  let re: RegExp;
  try {
    re = new RegExp(pattern);
  } catch {
    return { param_name: name, message: 'Invalid validation regex in template definition' };
  }
  if (!re.test(value)) {
    return { param_name: name, message: 'Value does not match required pattern' };
  }
  return null;
}

/// 业务规则：日期区间不超过上限，且结束不早于开始。
function validateDateRange(params: Record<string, string>): ValidationError | null {
  const startStr = params['start_date'];
  const endStr = params['end_date'];
  if (!startStr || !endStr) return null;

  const start = parseDate(startStr);
  const end = parseDate(endStr);
  if (start === null || end === null) return null; // 格式错误已由类型校验捕获

  if (end < start) {
    return { param_name: 'end_date', message: 'End date must be after start date' };
  }

  const days = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  if (days > MAX_DATE_RANGE_DAYS) {
    return {
      param_name: 'end_date',
      message: `Date range exceeds maximum of ${MAX_DATE_RANGE_DAYS} days (approx 12 months)`,
    };
  }
  return null;
}

/// 校验用户参数是否符合模板定义。
export function validateParameters(
  paramDefs: ParamDefinition[],
  params: Record<string, string>,
): ValidationResult {
  const errors: ValidationError[] = [];

  // 必填项缺失（required 默认 true；有 default 的不算缺）
  for (const pdef of paramDefs) {
    const required = pdef.required ?? true;
    if (required && !(pdef.name in params)) {
      if (pdef.default === undefined || pdef.default === null) {
        errors.push({
          param_name: pdef.name,
          message: `Required parameter '${pdef.label}' is missing`,
        });
      }
    }
  }

  // 逐个校验已提供的参数
  for (const pdef of paramDefs) {
    const value = params[pdef.name];
    if (value === undefined || value === null) continue;

    const typeErr = validateType(pdef.name, value, pdef.param_type);
    if (typeErr) {
      errors.push(typeErr);
      continue; // 类型都不对，不再跑自定义正则
    }

    if (pdef.validation_regex) {
      const regexErr = validateCustomRegex(pdef.name, value, pdef.validation_regex);
      if (regexErr) errors.push(regexErr);
    }
  }

  // 业务规则：日期区间
  const dateErr = validateDateRange(params);
  if (dateErr) errors.push(dateErr);

  return { valid: errors.length === 0, errors };
}
