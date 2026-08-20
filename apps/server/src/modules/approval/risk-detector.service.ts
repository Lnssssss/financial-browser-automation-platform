// 两阶段金融风险识别引擎。
//
// Stage 1：关键词 + 金额快筛（便宜，纯字符串匹配）。
// Stage 2：LLM 结合上下文精判（贵，仅在 Stage 1 命中后才跑）。
// 保守降级：配了 LLM 但调用失败 → 不放行，退回 Stage 1 且 medium 升 high。
//
// LLM 通过注入函数提供（与 agent/planner 的 LlmCallable 同构）——核心逻辑对
// "用哪个 LLM"无感知，注入 null 时只跑 Stage 1，全套逻辑可 mock 覆盖单测。

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  ALL_KEYWORDS,
  INDUSTRY_KEYWORDS,
  IndustryType,
  KeywordEntry,
  RiskLevel,
  hasHighAmount,
} from './risk-keywords';

/// 注入的 LLM 调用函数。给 prompt，返回 {risk_level, reason} 结构（或抛错/返回 null）。
export type RiskLlmCallable = (
  prompt: string,
) => Promise<{ risk_level?: string; reason?: string } | null>;

/// DI token：Stage 4 接真实 LLM 时 provide 实现；现未接线 → Optional 缺省 → 只跑 Stage 1。
export const RISK_LLM_CALLABLE = Symbol('RISK_LLM_CALLABLE');

/// 风险识别结果。stage/llmFallback 是可追溯字段，审计时能还原"这个判断怎么来的"。
export interface RiskAssessment {
  risk_level: RiskLevel;
  reason: string;
  matched_keywords: string[];
  stage: 1 | 2; // 1 = 仅关键词，2 = LLM 精判确认
  llm_fallback: boolean; // true = LLM 失败、用了 Stage 1 降级结果
}

// critical > high > medium 的排序权重（数字越小越严重）。
const RISK_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2 };

@Injectable()
export class RiskDetectorService {
  private readonly logger = new Logger(RiskDetectorService.name);
  private readonly llm: RiskLlmCallable | null;

  constructor(@Optional() @Inject(RISK_LLM_CALLABLE) llm?: RiskLlmCallable | null) {
    this.llm = llm ?? null;
  }

  /// Stage 1：按行业关键词库匹配，命中项按风险等级排序（critical 优先）。
  private keywordScan(text: string, industry?: IndustryType | null): KeywordEntry[] {
    const keywords = industry ? INDUSTRY_KEYWORDS[industry] ?? ALL_KEYWORDS : ALL_KEYWORDS;
    const textLower = text.toLowerCase();

    const matched = keywords.filter((kw) => textLower.includes(kw.keyword.toLowerCase()));
    matched.sort((a, b) => (RISK_ORDER[a.risk_level] ?? 3) - (RISK_ORDER[b.risk_level] ?? 3));
    return matched;
  }

  /// Stage 2：LLM 上下文精判。LLM 不可用或失败返回 null（交由上层保守降级）。
  private async llmRiskAnalysis(
    text: string,
    matchedKeywords: KeywordEntry[],
    pageContext?: string | null,
  ): Promise<RiskAssessment | null> {
    if (!this.llm) return null;

    let prompt =
      'You are a financial compliance officer. Analyze the following operation ' +
      'and determine its risk level (medium, high, or critical).\n\n' +
      `Operation description: ${text}\n` +
      `Matched risk keywords: ${matchedKeywords.map((k) => k.keyword).join(', ')}\n`;
    if (pageContext) prompt += `Page context: ${pageContext}\n`;
    prompt +=
      '\nRespond with exactly one JSON object:\n' +
      '{"risk_level": "medium|high|critical", "reason": "brief explanation"}\n';

    try {
      const result = await this.llm(prompt);
      if (result && typeof result === 'object') {
        const level = result.risk_level ?? 'high';
        const reason = result.reason ?? 'LLM analysis';
        if (level === 'medium' || level === 'high' || level === 'critical') {
          return {
            risk_level: level,
            reason,
            matched_keywords: matchedKeywords.map((k) => k.keyword),
            stage: 2,
            llm_fallback: false,
          };
        }
      }
    } catch (e) {
      this.logger.warn(`LLM risk analysis failed: ${e}`);
    }
    return null;
  }

  /// 对操作描述执行两阶段风险识别。永远返回一个 RiskAssessment。
  async detectRisk(
    text: string,
    industry?: IndustryType | null,
    pageContext?: string | null,
  ): Promise<RiskAssessment> {
    // Stage 1：关键词扫描
    const matched = this.keywordScan(text, industry);

    if (matched.length === 0) {
      // 没命中关键词，仍查大额
      if (hasHighAmount(text)) {
        return {
          risk_level: 'medium',
          reason: 'Large monetary amount detected without specific risk keywords',
          matched_keywords: [],
          stage: 1,
          llm_fallback: false,
        };
      }
      return {
        risk_level: 'low',
        reason: 'No risk indicators detected',
        matched_keywords: [],
        stage: 1,
        llm_fallback: false,
      };
    }

    // Stage 1 等级 = 命中项里最高（已排序，取第一个）
    let stage1Level: RiskLevel = matched[0].risk_level;
    const stage1Keywords = matched.map((k) => k.keyword);

    // 金额升级规则：命中 high 关键词 + 有大额 → 升 critical
    if (hasHighAmount(text) && stage1Level === 'high') {
      stage1Level = 'critical';
    }

    this.logger.log(`Stage 1 risk detected: level=${stage1Level}, keywords=${stage1Keywords.slice(0, 5)}`);

    // Stage 2：LLM 精判（仅 Stage 1 命中才跑）
    const llmResult = await this.llmRiskAnalysis(text, matched, pageContext);
    if (llmResult) {
      this.logger.log(`Stage 2 LLM confirmed risk: level=${llmResult.risk_level}`);
      return llmResult;
    }

    // 配了 LLM 却失败 → 保守降级：用 Stage 1 结果，且 medium 升 high
    if (this.llm) {
      this.logger.warn(`LLM risk analysis failed, using conservative fallback (stage1=${stage1Level})`);
      const fallbackLevel: RiskLevel = stage1Level === 'medium' ? 'high' : stage1Level;
      return {
        risk_level: fallbackLevel,
        reason: `Stage 1 keyword match (LLM fallback): ${stage1Keywords.slice(0, 3).join(', ')}`,
        matched_keywords: stage1Keywords,
        stage: 1,
        llm_fallback: true,
      };
    }

    // 未配 LLM → 直接返回 Stage 1 结果
    return {
      risk_level: stage1Level,
      reason: `Keyword match: ${stage1Keywords.slice(0, 3).join(', ')}`,
      matched_keywords: stage1Keywords,
      stage: 1,
      llm_fallback: false,
    };
  }
}
