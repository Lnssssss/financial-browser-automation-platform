import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ACTION_TYPES, AUDIT_LOG_PREFIX, generateAuditLogId } from './audit.types';
import { sanitizeInput, hashRawValue, DEFAULT_RULES } from './sanitizer';
import { generateObjectKey, getBucketName } from './audit-storage.service';
import { AuditLoggerService } from './audit-logger.service';
import { AuditQueryService } from './audit-query.service';
import { createHash } from 'crypto';

// 全链路审计与合规存储
// 模型字段/脱敏规则/存储 key 与 bucket 命名/写入优雅降级/查询过滤分页/三步全流程。

// ============================================================
// Types
// ============================================================

describe('ActionType', () => {
  it('all values', () => {
    const expected = new Set([
      'click', 'input_text', 'select_option', 'upload_file',
      'navigate', 'download', 'screenshot', 'wait', 'scroll', 'custom',
    ]);
    expect(new Set(ACTION_TYPES)).toEqual(expected);
  });
});

describe('generateAuditLogId', () => {
  it('has aud_ prefix', () => {
    expect(generateAuditLogId().startsWith(`${AUDIT_LOG_PREFIX}_`)).toBe(true);
  });
  it('unique across 100 calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateAuditLogId()));
    expect(ids.size).toBe(100);
  });
});

// ============================================================
// Sanitizer
// ============================================================

describe('sanitizeInput card number', () => {
  it('standard card', () => {
    const result = sanitizeInput('Card: 6222021234561234');
    expect(result).toContain('1234');
    expect(result).not.toContain('6222');
    expect(result).toContain('****1234');
  });
  it('card with spaces', () => {
    const result = sanitizeInput('6222 0212 3456 1234')!;
    expect(result.endsWith('1234')).toBe(true);
    expect(result).not.toContain('6222');
  });
  it('card with dashes', () => {
    const result = sanitizeInput('6222-0212-3456-1234');
    expect(result).toContain('1234');
    expect(result).not.toContain('6222');
  });
  it('no card untouched', () => {
    expect(sanitizeInput('Hello world')).toBe('Hello world');
  });
});

describe('sanitizeInput password', () => {
  it('english', () => {
    const result = sanitizeInput('password: MySecret123');
    expect(result).not.toContain('MySecret123');
    expect(result).toContain('********');
  });
  it('chinese', () => {
    const result = sanitizeInput('密码：ABC123xyz');
    expect(result).not.toContain('ABC123xyz');
    expect(result).toContain('********');
  });
  it('pwd variant', () => {
    expect(sanitizeInput('pwd=hunter2')).not.toContain('hunter2');
  });
  it('passwd variant', () => {
    expect(sanitizeInput('passwd: secret')).not.toContain('secret');
  });
});

describe('sanitizeInput id number', () => {
  it('18 digit id', () => {
    const result = sanitizeInput('ID: 110101199003071234');
    expect(result).toContain('1234');
    expect(result).not.toContain('110101');
  });
  it('id with X', () => {
    const result = sanitizeInput('身份证 11010119900307123X');
    expect(result).toContain('123X');
    expect(result).not.toContain('110101');
  });
});

describe('sanitizeInput phone', () => {
  it('mobile number', () => {
    const result = sanitizeInput('Phone: 13812345678')!;
    expect(result).toContain('138');
    expect(result).toContain('5678');
    expect(result).not.toContain('1234'); // middle digits masked
  });
  it('non-phone untouched', () => {
    expect(sanitizeInput('Amount: 12345')).toBe('Amount: 12345');
  });
});

describe('sanitizeInput null', () => {
  it('null in null out', () => {
    expect(sanitizeInput(null)).toBeNull();
  });
});

describe('sanitizeInput amount preserved', () => {
  it('amount kept', () => {
    expect(sanitizeInput('Transfer amount: ¥500,000.00')).toContain('500,000.00');
  });
  it('amount with text', () => {
    expect(sanitizeInput('转账金额 100万元')).toContain('100万元');
  });
});

describe('sanitizeInput repeated calls (stateful regex safety)', () => {
  it('same rule set reused across calls does not skip matches', () => {
    // DEFAULT_RULES 里的正则带 g 标志、跨调用复用同一 RegExp 对象——
    // 必须验证 lastIndex 重置生效，否则第二次调用可能漏脱敏。
    expect(sanitizeInput('password: first')).toContain('********');
    expect(sanitizeInput('password: second')).toContain('********');
  });
});

describe('hashRawValue', () => {
  it('consistency', () => {
    expect(hashRawValue('secret')).toBe(hashRawValue('secret'));
  });
  it('is sha256', () => {
    expect(hashRawValue('test')).toBe(createHash('sha256').update('test').digest('hex'));
  });
  it('null returns null', () => {
    expect(hashRawValue(null)).toBeNull();
  });
  it('different values different hashes', () => {
    expect(hashRawValue('a')).not.toBe(hashRawValue('b'));
  });
});

describe('DEFAULT_RULES', () => {
  it('has 4 rules in order password/card/id/phone', () => {
    expect(DEFAULT_RULES.map((r) => r.name)).toEqual(['password', 'card_number', 'id_number', 'phone']);
  });
});

// ============================================================
// Storage
// ============================================================

describe('generateObjectKey', () => {
  it('format', () => {
    const key = generateObjectKey('org_1', 'task_1', 0, 'before');
    expect(key.startsWith('audit/org_1/task_1/0_before_')).toBe(true);
    expect(key.endsWith('.png')).toBe(true);
  });
  it('uniqueness across 100 calls', () => {
    const keys = new Set(Array.from({ length: 100 }, () => generateObjectKey('o', 't', 0, 'before')));
    expect(keys.size).toBe(100);
  });
  it('after phase', () => {
    const key = generateObjectKey('org_1', 'task_1', 2, 'after');
    expect(key).toContain('2_after_');
  });
});

describe('getBucketName', () => {
  it('format', () => {
    expect(getBucketName(new Date(Date.UTC(2026, 2, 7)))).toBe('finrpa-audit-202603');
  });
  it('default current month', () => {
    const name = getBucketName();
    expect(name.startsWith('finrpa-audit-')).toBe(true);
    expect(name.length).toBe('finrpa-audit-202603'.length);
  });
  it('different months', () => {
    expect(getBucketName(new Date(Date.UTC(2026, 0, 15)))).toBe('finrpa-audit-202601');
    expect(getBucketName(new Date(Date.UTC(2026, 11, 31)))).toBe('finrpa-audit-202612');
  });
});

// ============================================================
// AuditLoggerService — graceful degradation
// ============================================================

function makePrismaMock() {
  return {
    auditLog: {
      create: vi.fn(),
    },
  };
}

describe('AuditLoggerService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: AuditLoggerService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new AuditLoggerService(prisma as never);
  });

  it('writes sanitized value and hash', async () => {
    prisma.auditLog.create.mockResolvedValue({ id: 'aud_1' });
    await service.writeAuditLog({
      taskId: 'task_1',
      orgId: 'org_1',
      departmentId: 'dept_a',
      actionIndex: 1,
      actionType: 'input_text',
      executor: 'agent',
      inputValue: '6222021234561234',
    });
    const arg = prisma.auditLog.create.mock.calls[0][0].data;
    expect(arg.inputValue).not.toContain('6222');
    expect(arg.inputValue).toContain('1234');
    expect(arg.inputValueRawHash).toBe(hashRawValue('6222021234561234'));
  });

  it('returns null and does not throw on DB failure', async () => {
    prisma.auditLog.create.mockRejectedValue(new Error('DB down'));
    const result = await service.writeAuditLog({
      taskId: 'task_1',
      orgId: 'org_1',
      departmentId: 'dept_a',
      actionIndex: 0,
      actionType: 'click',
      executor: 'agent',
    });
    expect(result).toBeNull();
  });

  it('rejects negative action_index without throwing (graceful)', async () => {
    const result = await service.writeAuditLog({
      taskId: 'task_1',
      orgId: 'org_1',
      departmentId: 'dept_a',
      actionIndex: -1,
      actionType: 'click',
      executor: 'agent',
    });
    expect(result).toBeNull();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});

// ============================================================
// AuditQueryService
// ============================================================

function makeQueryPrismaMock() {
  return {
    auditLog: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
}

describe('AuditQueryService', () => {
  let prisma: ReturnType<typeof makeQueryPrismaMock>;
  let service: AuditQueryService;

  beforeEach(() => {
    prisma = makeQueryPrismaMock();
    service = new AuditQueryService(prisma as never);
  });

  it('scopes to organizationId', async () => {
    prisma.auditLog.count.mockResolvedValue(0);
    prisma.auditLog.findMany.mockResolvedValue([]);
    await service.query({ organizationId: 'org_1', page: 1, pageSize: 20 });
    const where = prisma.auditLog.count.mock.calls[0][0].where;
    expect(where.organizationId).toBe('org_1');
  });

  it('applies task_id/action_type/executor filters', async () => {
    prisma.auditLog.count.mockResolvedValue(0);
    prisma.auditLog.findMany.mockResolvedValue([]);
    await service.query({
      organizationId: 'org_1',
      taskId: 'task_1',
      actionType: 'input_text',
      executor: 'eu_1',
      page: 1,
      pageSize: 20,
    });
    const where = prisma.auditLog.count.mock.calls[0][0].where;
    expect(where.taskId).toBe('task_1');
    expect(where.actionType).toBe('input_text');
    expect(where.executor).toBe('eu_1');
  });

  it('applies time range as closed interval', async () => {
    prisma.auditLog.count.mockResolvedValue(0);
    prisma.auditLog.findMany.mockResolvedValue([]);
    await service.query({
      organizationId: 'org_1',
      startTime: '2026-03-07T10:00:00',
      endTime: '2026-03-07T15:00:00',
      page: 1,
      pageSize: 20,
    });
    const where = prisma.auditLog.count.mock.calls[0][0].where;
    expect(where.createdAt.gte).toEqual(new Date('2026-03-07T10:00:00'));
    expect(where.createdAt.lte).toEqual(new Date('2026-03-07T15:00:00'));
  });

  it('orders by createdAt desc and paginates', async () => {
    prisma.auditLog.count.mockResolvedValue(25);
    prisma.auditLog.findMany.mockResolvedValue([]);
    await service.query({ organizationId: 'org_1', page: 3, pageSize: 10 });
    const args = prisma.auditLog.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
    expect(args.skip).toBe(20); // (3-1)*10
    expect(args.take).toBe(10);
  });

  it('returns total/page/pageSize alongside items', async () => {
    prisma.auditLog.count.mockResolvedValue(25);
    prisma.auditLog.findMany.mockResolvedValue([{ id: 'a' }]);
    const result = await service.query({ organizationId: 'org_1', page: 1, pageSize: 10 });
    expect(result.total).toBe(25);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(10);
    expect(result.items).toEqual([{ id: 'a' }]);
  });
});

// ============================================================
// Full flow: 3-step task -> 3 audit logs + 6 screenshot keys
// ============================================================

describe('full audit flow: 3-step task', () => {
  it('produces 3 logs and 6 unique screenshot keys, card number sanitized, approval carried', () => {
    const steps = [
      { action_index: 0, action_type: 'navigate', target_element: null, input_value: null, has_approval: false },
      {
        action_index: 1,
        action_type: 'input_text',
        target_element: 'input#account',
        input_value: '6222021234561234',
        has_approval: false,
      },
      {
        action_index: 2,
        action_type: 'click',
        target_element: 'button#submit',
        input_value: null,
        has_approval: true,
        approval_id: 'apr_001',
        approver_user_id: 'eu_approver',
      },
    ];

    const auditLogs: Record<string, unknown>[] = [];
    const screenshotKeys: string[] = [];

    for (const step of steps) {
      const beforeKey = generateObjectKey('org_1', 'task_1', step.action_index, 'before');
      const afterKey = generateObjectKey('org_1', 'task_1', step.action_index, 'after');
      screenshotKeys.push(beforeKey, afterKey);

      auditLogs.push({
        audit_log_id: generateAuditLogId(),
        action_type: step.action_type,
        input_value: sanitizeInput(step.input_value),
        input_value_raw_hash: hashRawValue(step.input_value),
        has_approval: step.has_approval,
        approval_id: (step as { approval_id?: string }).approval_id ?? null,
        approver_user_id: (step as { approver_user_id?: string }).approver_user_id ?? null,
      });
    }

    expect(auditLogs.length).toBe(3);
    expect(screenshotKeys.length).toBe(6);

    expect(auditLogs[0].action_type).toBe('navigate');
    expect(auditLogs[0].input_value).toBeNull();

    expect(auditLogs[1].action_type).toBe('input_text');
    expect(auditLogs[1].input_value as string).not.toContain('6222');
    expect(auditLogs[1].input_value as string).toContain('1234');
    expect(auditLogs[1].input_value_raw_hash).not.toBeNull();

    expect(auditLogs[2].action_type).toBe('click');
    expect(auditLogs[2].has_approval).toBe(true);
    expect(auditLogs[2].approval_id).toBe('apr_001');
    expect(auditLogs[2].approver_user_id).toBe('eu_approver');

    expect(new Set(screenshotKeys).size).toBe(6);
    for (const key of screenshotKeys) {
      expect(key.startsWith('audit/org_1/task_1/')).toBe(true);
      expect(key.endsWith('.png')).toBe(true);
    }
  });
});
