import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  TEMPLATE_REGISTRY,
  getTemplate,
  getTemplatesByIndustry,
  BANKING_STATEMENT_COLLECTION,
  BANKING_LOAN_REMINDER,
} from './workflow-templates';
import { ParamCryptoService, InvalidTokenError } from './param-crypto.service';
import { validateParameters } from './workflow-validator';

// 逐条翻译自源项目 tests/unit/test_workflows.py 的模板/crypto/validator 部分。
// 作为 workflow 纯逻辑三件套的行为对齐基准。

// ============================================================
// 模板注册表
// ============================================================

describe('template registry', () => {
  it('registers exactly six templates', () => {
    expect(Object.keys(TEMPLATE_REGISTRY).length).toBe(6);
  });

  it('all template ids unique', () => {
    const ids = Object.keys(TEMPLATE_REGISTRY);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it('two banking templates', () => {
    const banking = getTemplatesByIndustry('banking');
    expect(banking.length).toBe(2);
    const names = new Set(banking.map((t) => t.name));
    expect(names.has('网银账单自动采集')).toBe(true);
    expect(names.has('定期贷款还款提醒查询')).toBe(true);
  });

  it('two insurance templates', () => {
    const insurance = getTemplatesByIndustry('insurance');
    expect(insurance.length).toBe(2);
    const names = new Set(insurance.map((t) => t.name));
    expect(names.has('理赔案件批量状态查询')).toBe(true);
    expect(names.has('保单到期续保提醒核查')).toBe(true);
  });

  it('two securities templates', () => {
    const securities = getTemplatesByIndustry('securities');
    expect(securities.length).toBe(2);
    const names = new Set(securities.map((t) => t.name));
    expect(names.has('研报数据自动归档')).toBe(true);
    expect(names.has('基金净值数据采集')).toBe(true);
  });

  it('get template by id', () => {
    const t = getTemplate('tpl_banking_statement');
    expect(t).not.toBeNull();
    expect(t?.name).toBe('网银账单自动采集');
  });

  it('get template not found returns null', () => {
    expect(getTemplate('tpl_nonexistent')).toBeNull();
  });

  it('unknown industry returns empty', () => {
    expect(getTemplatesByIndustry('unknown')).toEqual([]);
  });

  it('each template has parameters', () => {
    for (const [tid, t] of Object.entries(TEMPLATE_REGISTRY)) {
      expect(t.parameters.length, `template ${tid} has no parameters`).toBeGreaterThan(0);
    }
  });

  it('each template has at least one sensitive param', () => {
    for (const [tid, t] of Object.entries(TEMPLATE_REGISTRY)) {
      const sensitive = t.parameters.filter((p) => p.sensitive);
      expect(sensitive.length, `template ${tid} has no sensitive parameters`).toBeGreaterThanOrEqual(1);
    }
  });

  it('industries cover banking/insurance/securities', () => {
    const industries = new Set(Object.values(TEMPLATE_REGISTRY).map((t) => t.industry));
    expect(industries).toEqual(new Set(['banking', 'insurance', 'securities']));
  });
});

// ============================================================
// 敏感参数加解密 / 掩码
// ============================================================

describe('ParamCryptoService encrypt/decrypt', () => {
  let crypto: ParamCryptoService;

  beforeAll(() => {
    crypto = new ParamCryptoService();
    crypto.setKey('test-master-key-for-workflows');
  });

  afterAll(() => crypto.resetKey());

  it('encrypt/decrypt roundtrip', () => {
    const original = 'MySecretPassword123!';
    const encrypted = crypto.encryptValue(original);
    expect(crypto.decryptValue(encrypted)).toBe(original);
  });

  it('ciphertext differs from plaintext', () => {
    const original = 'password';
    expect(crypto.encryptValue(original)).not.toBe(original);
  });

  it('same plaintext encrypts differently (random iv)', () => {
    expect(crypto.encryptValue('same')).not.toBe(crypto.encryptValue('same'));
  });

  it('decrypt with wrong key throws InvalidToken', () => {
    const encrypted = crypto.encryptValue('secret');
    const other = new ParamCryptoService();
    other.setKey('a-totally-different-master-key');
    expect(() => other.decryptValue(encrypted)).toThrow(InvalidTokenError);
  });
});

describe('ParamCryptoService mask', () => {
  const crypto = new ParamCryptoService();

  it('short value fully masked', () => {
    expect(crypto.maskValue('abc')).toBe('****');
    expect(crypto.maskValue('ab')).toBe('****');
  });

  it('four chars fully masked', () => {
    expect(crypto.maskValue('abcd')).toBe('****');
  });

  it('five chars keeps first and last', () => {
    expect(crypto.maskValue('abcde')).toBe('a***e');
  });

  it('long value keeps ends, same length', () => {
    const result = crypto.maskValue('MySecretPassword');
    expect(result[0]).toBe('M');
    expect(result[result.length - 1]).toBe('d');
    expect(result).toContain('*');
    expect(result.length).toBe('MySecretPassword'.length);
  });
});

// ============================================================
// 参数校验
// ============================================================

describe('validateParameters', () => {
  const bankParams = () => BANKING_STATEMENT_COLLECTION.parameters;

  it('valid params pass', () => {
    const r = validateParameters(bankParams(), {
      bank_url: 'https://ebank.example.com',
      username: 'user1',
      password: 'pass123',
      account_number: '6222021234561234',
      start_date: '2026-01-01',
      end_date: '2026-03-01',
    });
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('missing required fields reported', () => {
    const r = validateParameters(bankParams(), { bank_url: 'https://ebank.example.com' });
    expect(r.valid).toBe(false);
    const missing = new Set(r.errors.map((e) => e.param_name));
    expect(missing.has('username')).toBe(true);
    expect(missing.has('password')).toBe(true);
  });

  it('invalid url reported', () => {
    const r = validateParameters(bankParams(), {
      bank_url: 'not-a-url',
      username: 'u', password: 'p', account_number: '1234',
      start_date: '2026-01-01', end_date: '2026-02-01',
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.param_name === 'bank_url')).toBe(true);
  });

  it('invalid date (month 13) reported', () => {
    const r = validateParameters(bankParams(), {
      bank_url: 'https://ebank.example.com',
      username: 'u', password: 'p', account_number: '1234',
      start_date: '2026-13-01', end_date: '2026-02-01',
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.param_name === 'start_date')).toBe(true);
  });

  it('date range exceeding 365 days reported', () => {
    const r = validateParameters(bankParams(), {
      bank_url: 'https://ebank.example.com',
      username: 'u', password: 'p', account_number: '1234',
      start_date: '2024-01-01', end_date: '2026-01-01',
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.message.includes('365 days'))).toBe(true);
  });

  it('end before start reported', () => {
    const r = validateParameters(bankParams(), {
      bank_url: 'https://ebank.example.com',
      username: 'u', password: 'p', account_number: '1234',
      start_date: '2026-03-01', end_date: '2026-01-01',
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.message.includes('after start'))).toBe(true);
  });

  it('invalid integer reported', () => {
    const r = validateParameters(BANKING_LOAN_REMINDER.parameters, {
      system_url: 'https://credit.example.com',
      username: 'u', password: 'p',
      days_ahead: 'not_a_number',
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.param_name === 'days_ahead')).toBe(true);
  });

  it('optional with default not required', () => {
    const r = validateParameters(BANKING_LOAN_REMINDER.parameters, {
      system_url: 'https://credit.example.com',
      username: 'u', password: 'p',
      // days_ahead 有 default，branch_code 可选
    });
    expect(r.valid).toBe(true);
  });
});
