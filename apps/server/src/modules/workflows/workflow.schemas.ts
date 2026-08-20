// 工作流模板的数据结构。
// 模板 = 金融 RPA 场景的"可复用剧本"：声明这个业务要填哪些参数（含敏感标记、
// 格式类型）、由哪些 skill 按序组成、命中什么行业与风险等级。
// 纯类型 + 常量，无行为——校验在 workflow-validator，加解密在 param-crypto。

/// 行业分类。值与 approval 模块的 IndustryType 对齐（banking/insurance/securities），
/// 用字符串字面量而非 TS enum：模板注册表按 industry 字符串过滤，字面量更直接、可直接对比。
export type IndustryType = 'banking' | 'insurance' | 'securities';

/// 参数的格式类型。决定 validator 用哪套规则校验（整数/日期/URL/邮箱/密码）。
export type ParamType =
  | 'string'
  | 'integer'
  | 'date'
  | 'password'
  | 'url'
  | 'email';

/// 单个工作流参数的定义。
/// sensitive=true 的参数：入库前用 AES-256-GCM 加密、读取时掩码显示（见 param-crypto）。
export interface ParamDefinition {
  name: string;
  label: string; // 人类可读标签
  param_type: ParamType;
  required?: boolean; // 默认 true
  sensitive?: boolean; // 默认 false；true = 加密存储 + 掩码返回
  description?: string;
  default?: string | null;
  validation_regex?: string | null; // 可选：额外的格式正则
}

/// 模板里的一个 skill 调用步骤。
/// 把工作流参数映射到 skill 参数，让模板由可复用 skill 组合而成。
export interface SkillStepDefinition {
  skill_name: string; // 必须匹配已注册的 skill 名
  description?: string; // 人类可读的步骤说明
  // 映射：skill 参数名 -> 工作流参数名，或字面值（以 "=" 前缀）。
  // 例：{ url: 'bank_url', username: 'username', max_rows: '=500' }
  param_mapping?: Record<string, string>;
  error_strategy_override?: string | null;
}

/// 一个可复用的金融 RPA 工作流模板。
export interface WorkflowTemplate {
  template_id: string;
  name: string;
  industry: IndustryType;
  risk_level: string; // low / medium / high / critical
  description: string;
  navigation_target: string; // 目标系统/页面描述
  expected_result: string; // 预期产出描述
  approval_rule: string; // 适用的审批规则描述
  parameters: ParamDefinition[];
  tags: string[];
  skill_steps: SkillStepDefinition[];
}
