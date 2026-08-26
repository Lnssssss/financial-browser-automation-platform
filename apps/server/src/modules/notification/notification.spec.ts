// 通知模块单测：模板渲染、渠道发送（注入假 HttpPoster）、回退逻辑、
// 重试队列入队、投递结果聚合、webhook 配置解析。

import { describe, it, expect } from 'vitest';
import {
  RISK_EMOJI,
  RISK_LABEL_CN,
  timeoutDisplay,
  renderMarkdown,
  renderWecomPayload,
  renderDingtalkPayload,
} from './notification-templates';
import {
  NotificationChannelsService,
  WEBHOOK_TIMEOUT_MS,
} from './notification-channels.service';
import type { HttpPoster, HttpResponse } from './notification-channels.service';
import {
  NotificationDispatcherService,
  DispatchResult,
  resolveWebhookConfigs,
  RETRY_QUEUE_KEY,
} from './notification-dispatcher.service';
import type { RetryQueueClient } from './notification-dispatcher.service';
import type {
  ApprovalNotificationContext,
  WebhookConfig,
  NotificationAttempt,
  SendResult,
} from './notification.types';

function makeCtx(overrides: Partial<ApprovalNotificationContext> = {}): ApprovalNotificationContext {
  return {
    approvalId: 'apr_001',
    taskId: 'task_001',
    riskLevel: 'high',
    riskReason: 'Contains wire transfer keyword',
    departmentName: '对公信贷部',
    businessLineName: '企业贷款',
    operationDescription: 'Execute wire transfer 500万',
    screenshotUrl: 'https://minio.example.com/screenshots/task_001.png',
    approvalUrl: 'https://app.example.com/approvals/apr_001',
    timeoutSeconds: 3600,
    ...overrides,
  };
}

/// 假 HttpPoster：可预设固定响应、抛错，并记录最后一次入参。
class FakePoster implements HttpPoster {
  lastUrl?: string;
  lastJson?: unknown;
  lastTimeout?: number;
  calls = 0;

  constructor(
    private readonly resolver: (url: string, json: unknown) => Promise<HttpResponse>,
  ) {}

  async post(url: string, json: unknown, timeoutMs: number): Promise<HttpResponse> {
    this.calls += 1;
    this.lastUrl = url;
    this.lastJson = json;
    this.lastTimeout = timeoutMs;
    return this.resolver(url, json);
  }
}

function okResponse(): HttpResponse {
  return { status: 200, text: '{"errcode": 0, "errmsg": "ok"}' };
}

// ============================================================
// 模板
// ============================================================

describe('timeoutDisplay', () => {
  it('hours', () => {
    expect(timeoutDisplay(3600)).toBe('1 小时');
    expect(timeoutDisplay(7200)).toBe('2 小时');
  });
  it('minutes', () => {
    expect(timeoutDisplay(1800)).toBe('30 分钟');
    expect(timeoutDisplay(300)).toBe('5 分钟');
  });
});

describe('renderMarkdown', () => {
  it('contains risk emoji + label', () => {
    const md = renderMarkdown(makeCtx({ riskLevel: 'critical' }));
    expect(md).toContain('🔴');
    expect(md).toContain('严重风险');
  });
  it('contains approval id', () => {
    expect(renderMarkdown(makeCtx())).toContain('apr_001');
  });
  it('contains department', () => {
    expect(renderMarkdown(makeCtx())).toContain('对公信贷部');
  });
  it('contains business line', () => {
    expect(renderMarkdown(makeCtx())).toContain('企业贷款');
  });
  it('omits business line when absent', () => {
    expect(renderMarkdown(makeCtx({ businessLineName: null }))).not.toContain('业务线');
  });
  it('contains screenshot link', () => {
    const md = renderMarkdown(makeCtx());
    expect(md).toContain('查看操作截图');
    expect(md).toContain('minio.example.com');
  });
  it('omits screenshot when absent', () => {
    expect(renderMarkdown(makeCtx({ screenshotUrl: null }))).not.toContain('查看操作截图');
  });
  it('contains timeout', () => {
    expect(renderMarkdown(makeCtx({ timeoutSeconds: 1800 }))).toContain('30 分钟');
  });
  it('contains approval link', () => {
    expect(renderMarkdown(makeCtx())).toContain('立即审批');
  });
  it('all risk levels render emoji + label', () => {
    for (const [level, emoji] of Object.entries(RISK_EMOJI)) {
      const md = renderMarkdown(makeCtx({ riskLevel: level }));
      expect(md).toContain(emoji);
      expect(md).toContain(RISK_LABEL_CN[level]);
    }
  });
});

describe('renderWecomPayload', () => {
  it('msgtype markdown', () => {
    expect(renderWecomPayload(makeCtx()).msgtype).toBe('markdown');
  });
  it('has content with approval id', () => {
    const payload = renderWecomPayload(makeCtx()) as { markdown: { content: string } };
    expect(payload.markdown.content).toContain('apr_001');
  });
});

describe('renderDingtalkPayload', () => {
  it('msgtype actionCard', () => {
    expect(renderDingtalkPayload(makeCtx()).msgtype).toBe('actionCard');
  });
  it('has title', () => {
    const p = renderDingtalkPayload(makeCtx()) as { actionCard: { title: string } };
    expect(p.actionCard.title).toContain('审批请求');
  });
  it('has approval button + url', () => {
    const p = renderDingtalkPayload(makeCtx()) as {
      actionCard: { singleTitle: string; singleURL: string };
    };
    expect(p.actionCard.singleTitle).toBe('立即审批');
    expect(p.actionCard.singleURL).toContain('approvals/apr_001');
  });
  it('singleURL falls back to empty string', () => {
    const p = renderDingtalkPayload(makeCtx({ approvalUrl: null })) as {
      actionCard: { singleURL: string };
    };
    expect(p.actionCard.singleURL).toBe('');
  });
});

// ============================================================
// 渠道（注入假 poster）
// ============================================================

describe('NotificationChannelsService', () => {
  it('wecom success', async () => {
    const svc = new NotificationChannelsService(new FakePoster(async () => okResponse()));
    const r = await svc.sendWecom('https://hook/wecom', { msgtype: 'markdown' });
    expect(r.success).toBe(true);
    expect(r.channel).toBe('wecom');
  });

  it('wecom api error (200 but errcode!=0)', async () => {
    const poster = new FakePoster(async () => ({
      status: 200,
      text: '{"errcode": 45009, "errmsg": "api freq out of limit"}',
    }));
    const r = await new NotificationChannelsService(poster).sendWecom('https://hook/wecom', {});
    expect(r.success).toBe(false);
    expect(r.error).toContain('api freq out of limit');
  });

  it('wecom http error', async () => {
    const poster = new FakePoster(async () => ({ status: 500, text: 'Internal Server Error' }));
    const r = await new NotificationChannelsService(poster).sendWecom('https://hook/wecom', {});
    expect(r.success).toBe(false);
    expect(r.statusCode).toBe(500);
  });

  it('wecom timeout (AbortError → success=false with Timeout)', async () => {
    const poster = new FakePoster(async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    });
    const r = await new NotificationChannelsService(poster).sendWecom('https://hook/wecom', {});
    expect(r.success).toBe(false);
    expect(r.error).toContain('Timeout');
  });

  it('wecom generic error', async () => {
    const poster = new FakePoster(async () => {
      throw new Error('connection refused');
    });
    const r = await new NotificationChannelsService(poster).sendWecom('https://hook/wecom', {});
    expect(r.success).toBe(false);
    expect(r.error).toContain('connection refused');
  });

  it('passes WEBHOOK_TIMEOUT_MS to poster', async () => {
    const poster = new FakePoster(async () => okResponse());
    await new NotificationChannelsService(poster).sendWecom('https://hook/wecom', {});
    expect(poster.lastTimeout).toBe(WEBHOOK_TIMEOUT_MS);
  });

  it('dingtalk success', async () => {
    const r = await new NotificationChannelsService(new FakePoster(async () => okResponse())).sendDingtalk(
      'https://oapi.dingtalk.com/robot/send',
      {},
    );
    expect(r.success).toBe(true);
    expect(r.channel).toBe('dingtalk');
  });

  it('dingtalk api error', async () => {
    const poster = new FakePoster(async () => ({
      status: 200,
      text: '{"errcode": 310000, "errmsg": "sign not match"}',
    }));
    const r = await new NotificationChannelsService(poster).sendDingtalk('https://oapi/send', {});
    expect(r.success).toBe(false);
    expect(r.error).toContain('sign not match');
  });
});

// ============================================================
// 编排器：回退
// ============================================================

/// 用一个可编程的 channels 替身驱动 dispatcher 的回退分支。
function stubChannels(
  wecomResults: SendResult[],
  dingtalkResults: SendResult[],
): NotificationChannelsService {
  let wi = 0;
  let di = 0;
  return {
    sendWecom: async () => wecomResults[wi++],
    sendDingtalk: async () => dingtalkResults[di++],
  } as unknown as NotificationChannelsService;
}

describe('sendWithFallback', () => {
  it('wecom success → no fallback', async () => {
    const disp = new NotificationDispatcherService(
      stubChannels([{ success: true, channel: 'wecom', statusCode: 200 }], []),
    );
    const config: WebhookConfig = { userId: 'eu_1', wecomUrl: 'https://wecom' };
    const attempts = await disp.sendWithFallback(makeCtx(), config);
    expect(attempts).toHaveLength(1);
    expect(attempts[0].success).toBe(true);
    expect(attempts[0].channel).toBe('wecom');
  });

  it('wecom fail → fallback dingtalk success', async () => {
    const disp = new NotificationDispatcherService(
      stubChannels(
        [{ success: false, channel: 'wecom', error: 'timeout' }],
        [{ success: true, channel: 'dingtalk', statusCode: 200 }],
      ),
    );
    const config: WebhookConfig = { userId: 'eu_1', wecomUrl: 'https://wecom', dingtalkUrl: 'https://ding' };
    const attempts = await disp.sendWithFallback(makeCtx(), config);
    expect(attempts).toHaveLength(2);
    expect(attempts[0].success).toBe(false);
    expect(attempts[0].channel).toBe('wecom');
    expect(attempts[1].success).toBe(true);
    expect(attempts[1].channel).toBe('dingtalk');
  });

  it('both fail', async () => {
    const disp = new NotificationDispatcherService(
      stubChannels(
        [{ success: false, channel: 'wecom', error: 'fail' }],
        [{ success: false, channel: 'dingtalk', error: 'fail' }],
      ),
    );
    const config: WebhookConfig = { userId: 'eu_1', wecomUrl: 'https://wecom', dingtalkUrl: 'https://ding' };
    const attempts = await disp.sendWithFallback(makeCtx(), config);
    expect(attempts).toHaveLength(2);
    expect(attempts.every((a) => !a.success)).toBe(true);
  });

  it('no webhook configured → single failed attempt channel=none', async () => {
    const disp = new NotificationDispatcherService(stubChannels([], []));
    const attempts = await disp.sendWithFallback(makeCtx(), { userId: 'eu_1' });
    expect(attempts).toHaveLength(1);
    expect(attempts[0].success).toBe(false);
    expect(attempts[0].error).toContain('No webhook configured');
    expect(attempts[0].channel).toBe('none');
  });

  it('only dingtalk configured', async () => {
    const disp = new NotificationDispatcherService(
      stubChannels([], [{ success: true, channel: 'dingtalk', statusCode: 200 }]),
    );
    const attempts = await disp.sendWithFallback(makeCtx(), {
      userId: 'eu_1',
      dingtalkUrl: 'https://ding',
    });
    expect(attempts).toHaveLength(1);
    expect(attempts[0].success).toBe(true);
    expect(attempts[0].channel).toBe('dingtalk');
  });
});

// ============================================================
// 编排器：dispatch + 重试队列
// ============================================================

/// 假 Redis：记录 rpush 调用。
class FakeRedis implements RetryQueueClient {
  calls: Array<[string, string]> = [];
  async rpush(key: string, value: string): Promise<number> {
    this.calls.push([key, value]);
    return this.calls.length;
  }
}

/// 直接替身掉 sendWithFallback，聚焦 dispatch 层聚合/入队逻辑。
function dispatcherWithFallback(
  fn: (ctx: ApprovalNotificationContext, config: WebhookConfig) => Promise<NotificationAttempt[]>,
): NotificationDispatcherService {
  const disp = new NotificationDispatcherService(stubChannels([], []));
  disp.sendWithFallback = fn;
  return disp;
}

function attempt(userId: string, success: boolean, error?: string): NotificationAttempt {
  return {
    approvalId: 'apr_1',
    targetUserId: userId,
    channel: 'wecom',
    success,
    error: error ?? null,
    timestamp: '2026-01-01T00:00:00.000Z',
  };
}

describe('dispatchNotifications', () => {
  it('success → no retry queued', async () => {
    const disp = dispatcherWithFallback(async () => [attempt('eu_1', true)]);
    const result = await disp.dispatchNotifications(makeCtx(), [
      { userId: 'eu_1', wecomUrl: 'https://wecom' },
    ]);
    expect(result.totalSuccess).toBe(1);
    expect(result.totalFailed).toBe(0);
    expect(result.queuedForRetry).toBe(0);
  });

  it('failure with redis → enqueues retry', async () => {
    const disp = dispatcherWithFallback(async () => [attempt('eu_1', false, 'timeout')]);
    const redis = new FakeRedis();
    const result = await disp.dispatchNotifications(
      makeCtx(),
      [{ userId: 'eu_1', wecomUrl: 'https://wecom' }],
      redis,
    );
    expect(result.totalFailed).toBe(1);
    expect(result.queuedForRetry).toBe(1);
    expect(redis.calls).toHaveLength(1);
    expect(redis.calls[0][0]).toBe(RETRY_QUEUE_KEY);
  });

  it('failure without redis → not queued', async () => {
    const disp = dispatcherWithFallback(async () => [attempt('eu_1', false, 'fail')]);
    const result = await disp.dispatchNotifications(
      makeCtx(),
      [{ userId: 'eu_1', wecomUrl: 'https://wecom' }],
      null,
    );
    expect(result.totalFailed).toBe(1);
    expect(result.queuedForRetry).toBe(0);
  });

  it('multiple users: one success, one failed+queued', async () => {
    const disp = dispatcherWithFallback(async (_ctx, config) =>
      config.userId === 'eu_1' ? [attempt('eu_1', true)] : [attempt('eu_2', false, 'fail')],
    );
    const redis = new FakeRedis();
    const result = await disp.dispatchNotifications(
      makeCtx(),
      [
        { userId: 'eu_1', wecomUrl: 'https://wecom' },
        { userId: 'eu_2', wecomUrl: 'https://wecom2' },
      ],
      redis,
    );
    expect(result.totalSuccess).toBe(1);
    expect(result.totalFailed).toBe(1);
    expect(result.queuedForRetry).toBe(1);
  });
});

// ============================================================
// resolveWebhookConfigs / DispatchResult
// ============================================================

describe('resolveWebhookConfigs', () => {
  it('resolves existing users', () => {
    const map: Record<string, WebhookConfig> = {
      eu_1: { userId: 'eu_1', wecomUrl: 'https://w1' },
      eu_2: { userId: 'eu_2', dingtalkUrl: 'https://d2' },
    };
    const result = resolveWebhookConfigs(map, ['eu_1', 'eu_2']);
    expect(result).toHaveLength(2);
    expect(result[0].wecomUrl).toBe('https://w1');
    expect(result[1].dingtalkUrl).toBe('https://d2');
  });

  it('missing user gets placeholder', () => {
    const map: Record<string, WebhookConfig> = { eu_1: { userId: 'eu_1', wecomUrl: 'https://w1' } };
    const result = resolveWebhookConfigs(map, ['eu_1', 'eu_99']);
    expect(result).toHaveLength(2);
    expect(result[1].userId).toBe('eu_99');
    expect(result[1].wecomUrl).toBeUndefined();
    expect(result[1].dingtalkUrl).toBeUndefined();
  });

  it('empty targets', () => {
    expect(resolveWebhookConfigs({}, [])).toEqual([]);
  });
});

describe('DispatchResult', () => {
  it('totals derived from attempts', () => {
    const r = new DispatchResult('apr_1', [
      attempt('eu_1', true),
      attempt('eu_2', false, 'fail'),
      { ...attempt('eu_2', true), channel: 'dingtalk' },
    ]);
    expect(r.totalSuccess).toBe(2);
    expect(r.totalFailed).toBe(1);
  });

  it('empty', () => {
    const r = new DispatchResult('apr_1');
    expect(r.totalSuccess).toBe(0);
    expect(r.totalFailed).toBe(0);
  });
});
