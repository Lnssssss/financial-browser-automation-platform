import { describe, it, expect, beforeAll } from 'vitest';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { ParamCryptoService } from './param-crypto.service';

// WorkflowController + WorkflowService 行为测试。直接 new（项目约定，无 supertest）。
// 覆盖：list 全量/按行业/未知行业；detail 命中/404；instantiate 成功+敏感掩码/校验 422/模板 404。

function makeController(): WorkflowController {
  const crypto = new ParamCryptoService();
  crypto.setKey('test-key-for-workflow-controller');
  return new WorkflowController(new WorkflowService(crypto));
}

describe('WorkflowController.listTemplates', () => {
  const ctl = makeController();

  it('lists all six', () => {
    expect(ctl.listTemplates().length).toBe(6);
  });

  it('filters by industry', () => {
    const banking = ctl.listTemplates('banking');
    expect(banking.length).toBe(2);
    expect(banking.every((t) => t.industry === 'banking')).toBe(true);
  });

  it('unknown industry returns empty', () => {
    expect(ctl.listTemplates('unknown')).toEqual([]);
  });
});

describe('WorkflowController.getTemplateDetail', () => {
  const ctl = makeController();

  it('returns detail with parameters', () => {
    const data = ctl.getTemplateDetail('tpl_banking_statement');
    expect(data.name).toBe('网银账单自动采集');
    expect(data.industry).toBe('banking');
    expect(data.parameters.length).toBeGreaterThan(0);
  });

  it('unknown template throws 404', () => {
    expect(() => ctl.getTemplateDetail('tpl_fake')).toThrow(NotFoundException);
  });
});

describe('WorkflowController.instantiate', () => {
  const ctl = makeController();

  it('succeeds and masks sensitive params', () => {
    const data = ctl.instantiate('tpl_banking_statement', {
      parameters: {
        bank_url: 'https://ebank.example.com',
        username: 'testuser',
        password: 'Secret123',
        account_number: '6222021234561234',
        start_date: '2026-01-01',
        end_date: '2026-03-01',
      },
    } as never);
    expect(data.template_id).toBe('tpl_banking_statement');
    expect(data.validation_passed).toBe(true);
    expect(data.task_id.startsWith('task_')).toBe(true);
    // 敏感项已掩码，明文不出现
    expect(data.stored_parameters.password).not.toContain('Secret123');
    expect(data.stored_parameters.password).toContain('*');
    // 非敏感项原样
    expect(data.stored_parameters.username).toBe('testuser');
  });

  it('mask keeps first and last char of sensitive value', () => {
    const data = ctl.instantiate('tpl_insurance_claim_query', {
      parameters: {
        system_url: 'https://core.example.com',
        username: 'agent',
        password: 'SuperSecret!',
        claim_ids: 'CLM001,CLM002',
      },
    } as never);
    const pwd = data.stored_parameters.password;
    expect(pwd).not.toBe('SuperSecret!');
    expect(pwd.startsWith('S')).toBe(true);
    expect(pwd.endsWith('!')).toBe(true);
  });

  it('fills defaults for missing optional params', () => {
    const data = ctl.instantiate('tpl_banking_statement', {
      parameters: {
        bank_url: 'https://ebank.example.com',
        username: 'u',
        password: 'p',
        account_number: '1234',
        start_date: '2026-01-01',
        end_date: '2026-03-01',
        // output_path 缺省 → 应补 default
      },
    } as never);
    expect(data.stored_parameters.output_path).toBe('./downloads/statements/');
  });

  it('validation failure throws 422', () => {
    expect(() =>
      ctl.instantiate('tpl_banking_statement', {
        parameters: { bank_url: 'not-a-url' },
      } as never),
    ).toThrow(UnprocessableEntityException);
  });

  it('unknown template throws 404', () => {
    expect(() =>
      ctl.instantiate('tpl_fake', { parameters: {} } as never),
    ).toThrow(NotFoundException);
  });
});

describe('workflow templates ↔ skills wiring (skills 欠账回补)', () => {
  // 已注册 skill 名（skill-registry.service 装配的 7 个）。
  const REGISTERED_SKILLS = new Set([
    'login',
    'session_keep_alive',
    'form_fill',
    'search_and_select',
    'pagination',
    'table_extract',
    'file_download',
  ]);

  let templates: import('./workflow.schemas').WorkflowTemplate[];
  beforeAll(async () => {
    const { TEMPLATE_REGISTRY } = await import('./workflow-templates');
    templates = Object.values(TEMPLATE_REGISTRY);
  });

  it('all templates have >= 2 skill steps', () => {
    for (const t of templates) {
      expect(t.skill_steps.length, `template ${t.template_id}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('banking statement has login + table_extract + file_download', () => {
    const t = templates.find((x) => x.template_id === 'tpl_banking_statement')!;
    const names = t.skill_steps.map((s) => s.skill_name);
    expect(names).toContain('login');
    expect(names).toContain('table_extract');
    expect(names).toContain('file_download');
  });

  it('all referenced skills exist in registry', () => {
    for (const t of templates) {
      for (const step of t.skill_steps) {
        expect(
          REGISTERED_SKILLS.has(step.skill_name),
          `template ${t.template_id} references unknown skill '${step.skill_name}'`,
        ).toBe(true);
      }
    }
  });

  it('first step is login for all templates', () => {
    for (const t of templates) {
      expect(t.skill_steps[0].skill_name, `template ${t.template_id}`).toBe('login');
    }
  });
});
