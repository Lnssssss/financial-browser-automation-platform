// 基于页面复杂度估算的 LLM 模型路由。
// 简单页面走轻量模型（便宜/快），复杂页面走重型模型（更强），按 DOM 特征判定。
// 复杂度因子：DOM 元素数、iframe 嵌套深度、动态内容标志（AJAX/WebSocket/shadow DOM）、表单字段数。
// 纯逻辑：无 DI、无 IO，输入 PageFeatures 输出 RoutingDecision。

/// 页面复杂度分级。字面量联合，值直接可比。
export type ComplexityLevel = 'simple' | 'moderate' | 'complex';

/// LLM 模型档位。light=Haiku/mini，standard=Sonnet，heavy=Opus/4o。
export type ModelTier = 'light' | 'standard' | 'heavy';

/// 用于复杂度估算的 DOM 特征。全部给默认值，缺省 = 最简单页面。
export interface PageFeatures {
  element_count: number;
  has_iframe: boolean;
  iframe_depth: number;
  has_dynamic_content: boolean;
  has_shadow_dom: boolean;
  form_field_count: number;
}

/// 造一个默认 PageFeatures。
/// 让调用方只需填关心的字段：makeFeatures({ element_count: 200 })。
export function makeFeatures(overrides: Partial<PageFeatures> = {}): PageFeatures {
  return {
    element_count: 0,
    has_iframe: false,
    iframe_depth: 0,
    has_dynamic_content: false,
    has_shadow_dom: false,
    form_field_count: 0,
    ...overrides,
  };
}

/// 模型路由决策，带判定理由（可审计/可解释）。
export interface RoutingDecision {
  model_tier: ModelTier;
  complexity: ComplexityLevel;
  reason: string;
  features: PageFeatures;
}

// 复杂度分级阈值
const ELEMENT_THRESHOLD_SIMPLE = 100;
const ELEMENT_THRESHOLD_MODERATE = 500;
const FORM_FIELD_THRESHOLD_COMPLEX = 20;

/// 从 DOM 特征估算页面复杂度。
/// 判定顺序（先判 complex 再判 moderate，任一命中即返回）：
///   - COMPLEX：iframe 深嵌(>=2)、shadow DOM、元素数 >500、表单字段 >=20
///   - MODERATE：有 iframe、有动态内容、元素数 >100
///   - SIMPLE：以上都不满足
export function estimateComplexity(features: PageFeatures): ComplexityLevel {
  // complex 条件
  if (features.iframe_depth >= 2) return 'complex';
  if (features.has_shadow_dom) return 'complex';
  if (features.element_count > ELEMENT_THRESHOLD_MODERATE) return 'complex';
  if (features.form_field_count >= FORM_FIELD_THRESHOLD_COMPLEX) return 'complex';

  // moderate 条件
  if (features.has_iframe) return 'moderate';
  if (features.has_dynamic_content) return 'moderate';
  if (features.element_count > ELEMENT_THRESHOLD_SIMPLE) return 'moderate';

  return 'simple';
}

/// 复杂度 -> 模型档位映射。
const COMPLEXITY_TO_TIER: Record<ComplexityLevel, ModelTier> = {
  simple: 'light',
  moderate: 'standard',
  complex: 'heavy',
};

/// 按页面特征决定用哪档 LLM 模型，返回带理由的决策。
export function routeModel(features: PageFeatures): RoutingDecision {
  const complexity = estimateComplexity(features);
  const tier = COMPLEXITY_TO_TIER[complexity];

  const reasons: string[] = [];
  if (features.element_count > 0) reasons.push(`elements=${features.element_count}`);
  if (features.has_iframe) reasons.push(`iframe_depth=${features.iframe_depth}`);
  if (features.has_dynamic_content) reasons.push('dynamic_content');
  if (features.has_shadow_dom) reasons.push('shadow_dom');
  if (features.form_field_count > 0) reasons.push(`form_fields=${features.form_field_count}`);

  const reason = `${complexity} page (${reasons.join(', ') || 'default'})`;

  return { model_tier: tier, complexity, reason, features };
}
