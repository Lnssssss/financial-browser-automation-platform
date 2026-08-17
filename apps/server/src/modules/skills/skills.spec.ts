import { describe, it, expect, vi } from 'vitest';
import { ErrorStrategy, SkillContext, SkillStatus, BrowserPage } from './base';
import { LoginParams, LoginSkill, SessionKeepAliveParams, SessionKeepAliveSkill } from './auth-skills';
import {
  FormFillParams,
  FormFillSkill,
  PaginationParams,
  PaginationSkill,
  SearchAndSelectParams,
  SearchAndSelectSkill,
} from './interaction-skills';
import { FileDownloadParams, FileDownloadSkill, TableExtractParams, TableExtractSkill } from './extraction-skills';
import { SkillRegistryService } from './skill-registry.service';
import { PipelineService, SkillStep } from './pipeline.service';

// 逐条翻译自源项目 tests/unit/test_skills.py（不含 TestTemplateSkillSteps，
// 那 4 个依赖 workflows 模块，留到迁 workflows 时补）。
// 作为 skills 模块的行为对齐基准。真实 page 用 mock，与源码 AsyncMock 对齐（ADR-003）。

/// 手动装配注册表（等价源码全局 SKILL_REGISTRY，但显式 DI 装配）。
function makeRegistry(): SkillRegistryService {
  return new SkillRegistryService(
    new LoginSkill(),
    new SessionKeepAliveSkill(),
    new FormFillSkill(),
    new SearchAndSelectSkill(),
    new PaginationSkill(),
    new TableExtractSkill(),
    new FileDownloadSkill(),
  );
}

/// 造一个最小 mock page，未用到的方法给 no-op。
function mockPage(overrides: Partial<Record<keyof BrowserPage, unknown>> = {}): BrowserPage {
  const base: Record<string, unknown> = {
    goto: vi.fn(async () => {}),
    fill: vi.fn(async () => {}),
    click: vi.fn(async () => {}),
    content: vi.fn(async () => ''),
    waitForURL: vi.fn(async () => {}),
    querySelector: vi.fn(async () => null),
    querySelectorAll: vi.fn(async () => []),
    selectOption: vi.fn(async () => {}),
    waitForTimeout: vi.fn(async () => {}),
    evaluate: vi.fn(async () => null),
    keyboard: { press: vi.fn(async () => {}) },
    expectDownload: vi.fn(() => ({ value: vi.fn(async () => ({ suggested_filename: 'f', save_as: vi.fn(async () => {}) })) })),
  };
  return { ...base, ...overrides } as unknown as BrowserPage;
}

// ============================================================
// Registry tests
// ============================================================

describe('SkillRegistry', () => {
  it('all seven skills registered', () => {
    const reg = makeRegistry();
    const names = new Set(reg.listSkills().map((s) => s.name));
    for (const n of ['login', 'session_keep_alive', 'form_fill', 'search_and_select', 'pagination', 'table_extract', 'file_download']) {
      expect(names.has(n)).toBe(true);
    }
  });

  it('get skill by name', () => {
    const reg = makeRegistry();
    expect(reg.getSkill('login')).toBeInstanceOf(LoginSkill);
  });

  it('get skill not found', () => {
    expect(makeRegistry().getSkill('nonexistent')).toBeNull();
  });

  it('list skills returns metadata', () => {
    const skills = makeRegistry().listSkills();
    const names = new Set(skills.map((s) => s.name));
    expect(names.has('login')).toBe(true);
    expect(names.has('table_extract')).toBe(true);
    for (const s of skills) {
      expect(s.description).toBeDefined();
      expect(s.error_strategy).toBeDefined();
    }
  });
});

// ============================================================
// LoginSkill tests
// ============================================================

describe('LoginSkill', () => {
  it('params validation', () => {
    const p = new LoginParams({ url: 'https://bank.example.com', username: 'user1', password: 'pass123' });
    expect(p.url).toBe('https://bank.example.com');
    expect(p.captcha_strategy).toBe('skip');
    expect(p.success_indicator).toBe('');
  });

  it('params validation with all fields', () => {
    const p = new LoginParams({
      url: 'https://bank.example.com',
      username: 'user1',
      password: 'pass123',
      captcha_strategy: 'manual',
      submit_selector: '#login-btn',
      success_indicator: 'dashboard',
    });
    expect(p.captcha_strategy).toBe('manual');
    expect(p.submit_selector).toBe('#login-btn');
  });

  it('error strategy is abort', () => {
    expect(new LoginSkill().errorStrategy).toBe(ErrorStrategy.ABORT);
  });

  it('execute no page', async () => {
    const skill = new LoginSkill();
    const params = new LoginParams({ url: 'https://bank.example.com', username: 'user1', password: 'pass123' });
    const result = await skill.execute(params, {});
    expect(result.status).toBe(SkillStatus.FAILED);
    expect(result.error_message).toContain('No browser page');
  });

  it('execute with mock page', async () => {
    const skill = new LoginSkill();
    const params = new LoginParams({ url: 'https://bank.example.com', username: 'user1', password: 'pass123' });
    const page = mockPage();
    const result = await skill.execute(params, { page });
    expect(result.status).toBe(SkillStatus.COMPLETED);
    expect((result.data as { logged_in: boolean }).logged_in).toBe(true);
    expect(page.goto).toHaveBeenCalledOnce();
    expect((page.fill as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2); // username + password
  });

  it('execute with llm handler', async () => {
    const skill = new LoginSkill();
    const params = new LoginParams({ url: 'https://bank.example.com', username: 'user1', password: 'pass123' });
    const page = mockPage();
    const llmHandler = vi.fn(async () => {});
    const result = await skill.execute(params, { page, llm_handler: llmHandler });
    expect(result.status).toBe(SkillStatus.COMPLETED);
    expect(llmHandler).toHaveBeenCalledOnce();
  });

  it('execute captcha manual returns pending', async () => {
    const skill = new LoginSkill();
    const params = new LoginParams({ url: 'https://bank.example.com', username: 'user1', password: 'pass123', captcha_strategy: 'manual' });
    const page = mockPage();
    const result = await skill.execute(params, { page, llm_handler: vi.fn(async () => {}) });
    expect(result.status).toBe(SkillStatus.PENDING);
    expect((result.data as { needs_captcha: boolean }).needs_captcha).toBe(true);
  });

  it('audit dict masks password', () => {
    const skill = new LoginSkill();
    const params = new LoginParams({ url: 'https://bank.example.com', username: 'user1', password: 'SuperSecret123' });
    const audit = skill.toAuditDict(params);
    expect(audit.skill).toBe('login');
    expect(audit.params.username).toBe('user1');
    expect(audit.params.password).not.toBe('SuperSecret123');
    expect(String(audit.params.password)).toContain('*');
  });
});

// ============================================================
// TableExtractSkill tests
// ============================================================

describe('TableExtractSkill', () => {
  it('params defaults', () => {
    const p = new TableExtractParams();
    expect(p.output_format).toBe('json');
    expect(p.max_rows).toBe(1000);
    expect(p.skip_empty_rows).toBe(true);
  });

  it('error strategy is retry', () => {
    expect(new TableExtractSkill().errorStrategy).toBe(ErrorStrategy.RETRY);
  });

  it('execute no page', async () => {
    const result = await new TableExtractSkill().execute(new TableExtractParams(), {});
    expect(result.status).toBe(SkillStatus.FAILED);
    expect(result.error_message).toContain('No browser page');
  });

  it('execute no table found', async () => {
    const page = mockPage({ querySelector: vi.fn(async () => null) });
    const result = await new TableExtractSkill().execute(new TableExtractParams(), { page });
    expect(result.status).toBe(SkillStatus.FAILED);
    expect(result.error_message).toContain('No table found');
  });

  it('execute json output', async () => {
    const page = mockPage({
      querySelector: vi.fn(async () => ({}) as never),
      evaluate: vi.fn(async () => ({
        headers: ['Code', 'Name', 'NAV'],
        rows: [
          ['000001', 'Fund A', '1.234'],
          ['110011', 'Fund B', '2.567'],
        ],
      })),
    });
    const result = await new TableExtractSkill().execute(new TableExtractParams({ output_format: 'json' }), { page });
    expect(result.status).toBe(SkillStatus.COMPLETED);
    expect((result.data as { row_count: number }).row_count).toBe(2);
    expect((result.data as { output_format: string }).output_format).toBe('json');
    const output = (result.data as { output: Record<string, string>[] }).output;
    expect(Array.isArray(output)).toBe(true);
    expect(output[0].Code).toBe('000001');
    expect(output[1].NAV).toBe('2.567');
  });

  it('execute csv output', async () => {
    const page = mockPage({
      querySelector: vi.fn(async () => ({}) as never),
      evaluate: vi.fn(async () => ({ headers: ['A', 'B'], rows: [['1', '2'], ['3', '4']] })),
    });
    const result = await new TableExtractSkill().execute(new TableExtractParams({ output_format: 'csv' }), { page });
    expect(result.status).toBe(SkillStatus.COMPLETED);
    expect((result.data as { output_format: string }).output_format).toBe('csv');
    const csvText = (result.data as { output: string }).output;
    expect(csvText).toContain('A,B');
    expect(csvText).toContain('1,2');
  });

  it('execute header validation', async () => {
    const page = mockPage({
      querySelector: vi.fn(async () => ({}) as never),
      evaluate: vi.fn(async () => ({ headers: ['Fund Code', 'Fund Name', 'NAV Value'], rows: [['001', 'Test', '1.0']] })),
    });
    const result = await new TableExtractSkill().execute(new TableExtractParams({ headers: ['Code', 'NAV'] }), { page });
    expect(result.status).toBe(SkillStatus.COMPLETED);
    expect((result.data as { header_match: boolean }).header_match).toBe(true);
  });
});

// ============================================================
// SessionKeepAliveSkill tests
// ============================================================

describe('SessionKeepAliveSkill', () => {
  it('active session', async () => {
    const page = mockPage();
    const result = await new SessionKeepAliveSkill().execute(new SessionKeepAliveParams(), { page });
    expect(result.status).toBe(SkillStatus.COMPLETED);
    expect((result.data as { session_active: boolean }).session_active).toBe(true);
  });

  it('expired session indicator', async () => {
    const page = mockPage({
      content: vi.fn(async () => '<html>Your session expired. Please login again.</html>'),
    });
    const params = new SessionKeepAliveParams({ session_timeout_indicator: 'session expired', relogin_on_expire: false });
    const result = await new SessionKeepAliveSkill().execute(params, { page });
    expect(result.status).toBe(SkillStatus.FAILED);
    expect(result.error_message).toContain('Session expired');
  });
});

// ============================================================
// FormFillSkill tests
// ============================================================

describe('FormFillSkill', () => {
  it('form fill with llm', async () => {
    const skill = new FormFillSkill();
    const params = new FormFillParams({ field_mapping: { Username: 'admin', Account: '123456' } });
    const page = mockPage();
    const result = await skill.execute(params, { page, llm_handler: vi.fn(async () => {}) });
    expect(result.status).toBe(SkillStatus.COMPLETED);
    expect((result.data as { total: number }).total).toBe(2);
    expect((result.data as { filled_fields: string[] }).filled_fields.length).toBe(2);
  });
});

// ============================================================
// SearchAndSelectSkill tests
// ============================================================

describe('SearchAndSelectSkill', () => {
  it('search and select with llm', async () => {
    const skill = new SearchAndSelectSkill();
    const params = new SearchAndSelectParams({ search_text: 'CLM001', target_text: 'Claim CLM001' });
    const page = mockPage();
    const result = await skill.execute(params, { page, llm_handler: vi.fn(async () => {}) });
    expect(result.status).toBe(SkillStatus.COMPLETED);
    expect((result.data as { selected: string }).selected).toBe('Claim CLM001');
  });
});

// ============================================================
// PaginationSkill tests
// ============================================================

describe('PaginationSkill', () => {
  it('pagination stops on empty', async () => {
    const skill = new PaginationSkill();
    const params = new PaginationParams({ max_pages: 5, page_data_selector: 'tr.data-row', stop_on_empty: true });
    const page = mockPage({ querySelectorAll: vi.fn(async () => []) });
    const result = await skill.execute(params, { page });
    expect(result.status).toBe(SkillStatus.COMPLETED);
    expect((result.data as { pages_traversed: number }).pages_traversed).toBe(1);
    expect((result.data as { items_collected: number }).items_collected).toBe(0);
  });
});

// ============================================================
// FileDownloadSkill tests
// ============================================================

describe('FileDownloadSkill', () => {
  it('params defaults', () => {
    const p = new FileDownloadParams();
    expect(p.download_path).toBe('./downloads/');
    expect(p.wait_timeout_ms).toBe(30000);
  });

  it('no trigger found', async () => {
    const skill = new FileDownloadSkill();
    const params = new FileDownloadParams({ trigger_text: 'Download PDF' });
    const page = mockPage({ querySelector: vi.fn(async () => null) });
    const result = await skill.execute(params, { page });
    expect(result.status).toBe(SkillStatus.FAILED);
  });
});

// ============================================================
// Skill Pipeline tests
// ============================================================

describe('SkillPipeline', () => {
  function makePipeline(): PipelineService {
    return new PipelineService(makeRegistry());
  }

  it('successful pipeline', async () => {
    const page = mockPage();
    const steps: SkillStep[] = [
      { skill_name: 'login', params: { url: 'https://bank.example.com', username: 'user1', password: 'pass123' } },
    ];
    const result = await makePipeline().executePipeline(steps, { page });
    expect(result.success).toBe(true);
    expect(result.steps_completed).toBe(1);
    expect(result.steps_total).toBe(1);
  });

  it('pipeline abort on unknown skill', async () => {
    const steps: SkillStep[] = [{ skill_name: 'nonexistent_skill', params: {} }];
    const result = await makePipeline().executePipeline(steps, {});
    expect(result.success).toBe(false);
    expect(result.aborted_at_step).toBe(0);
    expect(result.error_message).toContain('Unknown skill');
  });

  it('pipeline abort on login failure', async () => {
    // login 是 ABORT 策略；无 page → login 失败 → 管道中止
    const steps: SkillStep[] = [
      { skill_name: 'login', params: { url: 'https://bank.example.com', username: 'user1', password: 'pass123' } },
      { skill_name: 'table_extract', params: {} },
    ];
    const result = await makePipeline().executePipeline(steps, {});
    expect(result.success).toBe(false);
    expect(result.aborted_at_step).toBe(0);
    expect(result.steps_completed).toBe(0);
  });

  it('pipeline skip on pagination failure', async () => {
    const page = mockPage({ querySelectorAll: vi.fn(async () => []) });
    const steps: SkillStep[] = [
      { skill_name: 'pagination', params: { max_pages: 1, page_data_selector: 'tr' }, error_strategy_override: 'skip' },
    ];
    const result = await makePipeline().executePipeline(steps, { page });
    expect(result.success).toBe(true);
  });

  it('pipeline with audit callback', async () => {
    const page = mockPage();
    const auditRecords: { step: number; skill: string; params: Record<string, unknown>; status: string }[] = [];
    const auditCb = async (
      stepIdx: number,
      skillName: string,
      paramsDict: Record<string, unknown>,
      result: { status: string },
    ) => {
      auditRecords.push({ step: stepIdx, skill: skillName, params: paramsDict, status: result.status });
    };
    const steps: SkillStep[] = [
      { skill_name: 'login', params: { url: 'https://bank.example.com', username: 'user1', password: 'pass123' } },
    ];
    const result = await makePipeline().executePipeline(steps, { page }, auditCb);
    expect(result.success).toBe(true);
    expect(auditRecords.length).toBe(1);
    expect(auditRecords[0].skill).toBe('login');
    // 审计里 password 被脱敏
    const params = auditRecords[0].params as { params: { password: string } };
    expect(params.params.password).not.toBe('pass123');
  });
});
