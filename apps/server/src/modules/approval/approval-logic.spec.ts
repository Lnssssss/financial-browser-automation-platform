import { describe, it, expect } from 'vitest';
import { hasHighAmount, detectAmounts, IndustryType, ALL_KEYWORDS } from './risk-keywords';
import { RiskDetectorService } from './risk-detector.service';
import { ApprovalRoutingService, COMPLIANCE_DEPT_ID, RISK_MGMT_DEPT_ID } from './approval-routing.service';

// 作为 approval 纯逻辑三件套的行为对齐基准。

// ============================================================
// 金额识别
// ============================================================

describe('hasHighAmount', () => {
  it('detects 万 above threshold', () => {
    expect(hasHighAmount('转账500万元')).toBe(true);
    expect(hasHighAmount('金额100万')).toBe(true);
  });

  it('below threshold 万 is not high', () => {
    expect(hasHighAmount('转账50万元')).toBe(false);
  });

  it('detects 亿 always high', () => {
    expect(hasHighAmount('1.5亿')).toBe(true);
  });

  it('detects million/billion', () => {
    expect(hasHighAmount('transfer 2 million')).toBe(true);
    expect(hasHighAmount('1 billion deal')).toBe(true);
  });

  it('no amount is false', () => {
    expect(hasHighAmount('普通查询操作')).toBe(false);
  });
});

describe('detectAmounts', () => {
  it('extracts amount strings', () => {
    const amounts = detectAmounts('转账¥500,000 到账户');
    expect(amounts.length).toBeGreaterThan(0);
  });
});

// ============================================================
// 两阶段风险识别（无 LLM）
// ============================================================

describe('RiskDetectorService (no llm)', () => {
  const detector = new RiskDetectorService(null);

  it('no keyword no amount → low', async () => {
    const r = await detector.detectRisk('查询账户余额');
    expect(r.risk_level).toBe('low');
    expect(r.stage).toBe(1);
  });

  it('amount without keyword → medium', async () => {
    const r = await detector.detectRisk('操作金额500万元');
    expect(r.risk_level).toBe('medium');
  });

  it('high keyword → high', async () => {
    const r = await detector.detectRisk('执行转账操作');
    expect(r.risk_level).toBe('high');
    expect(r.matched_keywords).toContain('转账');
  });

  it('critical keyword → critical', async () => {
    const r = await detector.detectRisk('执行销户操作');
    expect(r.risk_level).toBe('critical');
  });

  it('high keyword + high amount → escalate to critical', async () => {
    const r = await detector.detectRisk('转账500万元到外部账户');
    expect(r.risk_level).toBe('critical');
  });

  it('picks highest among multiple matches', async () => {
    // 同时含 high(转账) 和 critical(销户) → 取 critical
    const r = await detector.detectRisk('先转账再销户');
    expect(r.risk_level).toBe('critical');
  });

  it('industry-scoped scan', async () => {
    const r = await detector.detectRisk('核保确认', IndustryType.INSURANCE);
    expect(r.risk_level).toBe('high');
  });
});

// ============================================================
// 两阶段风险识别（有 LLM）
// ============================================================

describe('RiskDetectorService (with llm)', () => {
  it('stage 2 llm confirms level', async () => {
    const detector = new RiskDetectorService(async () => ({ risk_level: 'critical', reason: 'LLM judged critical' }));
    const r = await detector.detectRisk('执行转账操作');
    expect(r.risk_level).toBe('critical');
    expect(r.stage).toBe(2);
    expect(r.reason).toBe('LLM judged critical');
  });

  it('llm failure → conservative fallback, medium escalates to high', async () => {
    // Stage 1 命中 medium(审批通过)，LLM 抛错 → 降级且 medium 升 high
    const detector = new RiskDetectorService(async () => {
      throw new Error('LLM down');
    });
    const r = await detector.detectRisk('审批通过该申请');
    expect(r.risk_level).toBe('high');
    expect(r.llm_fallback).toBe(true);
    expect(r.stage).toBe(1);
  });

  it('llm not called when stage 1 misses', async () => {
    let called = false;
    const detector = new RiskDetectorService(async () => {
      called = true;
      return { risk_level: 'high', reason: 'x' };
    });
    const r = await detector.detectRisk('查询账户余额');
    expect(r.risk_level).toBe('low');
    expect(called).toBe(false); // Stage 1 没命中，不该调 LLM
  });

  it('llm returns invalid level → fallback', async () => {
    const detector = new RiskDetectorService(async () => ({ risk_level: 'boom', reason: 'invalid' }));
    const r = await detector.detectRisk('执行转账操作');
    // 非法等级被丢弃 → 走保守降级，high 保持 high
    expect(r.risk_level).toBe('high');
    expect(r.llm_fallback).toBe(true);
  });
});

// ============================================================
// 审批路由
// ============================================================

describe('ApprovalRoutingService', () => {
  const routing = new ApprovalRoutingService();

  it('low → no approval', () => {
    const route = routing.route('low', 'dept_a');
    expect(route.requires_approval).toBe(false);
  });

  it('medium → no approval (log only)', () => {
    const route = routing.route('medium', 'dept_a');
    expect(route.requires_approval).toBe(false);
  });

  it('high → source department approver', () => {
    const route = routing.route('high', 'dept_a');
    expect(route.requires_approval).toBe(true);
    expect(route.approver_department_id).toBe('dept_a');
    expect(route.approver_role).toBe('approver');
  });

  it('critical → compliance dept + notify risk mgmt', () => {
    const route = routing.route('critical', 'dept_a');
    expect(route.requires_approval).toBe(true);
    expect(route.approver_department_id).toBe(COMPLIANCE_DEPT_ID);
    expect(route.notify_department_ids).toContain(RISK_MGMT_DEPT_ID);
    expect(route.notify_roles).toContain('viewer');
  });

  it('unknown level → treated as high (source dept)', () => {
    const route = routing.route('weird', 'dept_a');
    expect(route.requires_approval).toBe(true);
    expect(route.approver_department_id).toBe('dept_a');
  });
});

// ============================================================
// 关键词库完整性
// ============================================================

describe('keyword library', () => {
  it('all keywords have valid risk levels', () => {
    for (const kw of ALL_KEYWORDS) {
      expect(['medium', 'high', 'critical']).toContain(kw.risk_level);
    }
  });
});
