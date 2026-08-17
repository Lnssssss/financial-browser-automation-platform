// 认证类 skill：LoginSkill、SessionKeepAliveSkill。逐行迁自 enterprise/skills/auth_skills.py。

import { Injectable, Logger } from '@nestjs/common';
import {
  BaseSkill,
  BrowserPage,
  ErrorStrategy,
  ParamsCtor,
  SkillContext,
  SkillResult,
  SkillStatus,
} from './base';

const now = () => performance.now();
const ms = (start: number) => Math.trunc(performance.now() - start);

// ------------------------------------------------------------------
// LoginSkill
// ------------------------------------------------------------------

export class LoginParams {
  url: string;
  username: string;
  password: string;
  captcha_strategy: string;
  submit_selector: string | null;
  success_indicator: string;

  constructor(raw: Record<string, unknown> = {}) {
    this.url = (raw.url as string) ?? '';
    this.username = (raw.username as string) ?? '';
    this.password = (raw.password as string) ?? '';
    this.captcha_strategy = (raw.captcha_strategy as string) ?? 'skip';
    this.submit_selector = (raw.submit_selector as string) ?? null;
    this.success_indicator = (raw.success_indicator as string) ?? '';
  }
}

@Injectable()
export class LoginSkill extends BaseSkill<LoginParams> {
  private readonly logger = new Logger(LoginSkill.name);
  readonly skillName = 'login';
  readonly description = 'Universal login flow with captcha handling';
  readonly paramsModel: ParamsCtor<LoginParams> = LoginParams;
  readonly errorStrategy = ErrorStrategy.ABORT;
  readonly maxRetries = 3;

  async execute(params: LoginParams, context?: SkillContext | null): Promise<SkillResult> {
    const start = now();
    const p = params;
    const ctx = context ?? {};

    try {
      const page = ctx.page;
      if (!page) {
        return { status: SkillStatus.FAILED, error_message: 'No browser page in context', duration_ms: ms(start) };
      }

      // Step 1: 打开登录页
      await page.goto(p.url, { waitUntil: 'domcontentloaded' });
      this.logger.log(`LoginSkill: navigated to ${p.url}`);

      // Step 2: 填凭据（优先 LLM 引导，否则回退选择器）
      const navigationGoal = `Fill username '${p.username}' and password into login form fields, then click submit`;
      const llmHandler = ctx.llm_handler;
      if (llmHandler) {
        await llmHandler(page, navigationGoal);
      } else {
        await page.fill("input[type='text'], input[name*='user']", p.username);
        await page.fill("input[type='password']", p.password);
        if (p.submit_selector) {
          await page.click(p.submit_selector);
        } else {
          await page.click("button[type='submit'], input[type='submit']");
        }
      }

      // Step 3: 需要人工验证码则挂起
      if (p.captcha_strategy === 'manual') {
        return {
          status: SkillStatus.PENDING,
          data: { needs_captcha: true, strategy: 'manual' },
          duration_ms: ms(start),
        };
      }

      // Step 4: 校验成功指示
      if (p.success_indicator) {
        try {
          await page.waitForURL(`**${p.success_indicator}**`, { timeout: 10000 });
        } catch {
          const content = await page.content();
          if (!content.includes(p.success_indicator)) {
            return {
              status: SkillStatus.FAILED,
              error_message: `Login success indicator '${p.success_indicator}' not found`,
              duration_ms: ms(start),
            };
          }
        }
      }

      const elapsed = ms(start);
      this.logger.log(`LoginSkill: login succeeded in ${elapsed}ms`);
      return { status: SkillStatus.COMPLETED, data: { logged_in: true, url: p.url }, duration_ms: elapsed };
    } catch (e) {
      this.logger.error(`LoginSkill failed: ${e}`);
      return { status: SkillStatus.FAILED, error_message: e instanceof Error ? e.message : String(e), duration_ms: ms(start) };
    }
  }
}

// ------------------------------------------------------------------
// SessionKeepAliveSkill
// ------------------------------------------------------------------

export class SessionKeepAliveParams {
  check_interval_seconds: number;
  heartbeat_url: string | null;
  session_timeout_indicator: string;
  relogin_on_expire: boolean;
  login_params: LoginParams | null;

  constructor(raw: Record<string, unknown> = {}) {
    this.check_interval_seconds = (raw.check_interval_seconds as number) ?? 300;
    this.heartbeat_url = (raw.heartbeat_url as string) ?? null;
    this.session_timeout_indicator = (raw.session_timeout_indicator as string) ?? '';
    this.relogin_on_expire = (raw.relogin_on_expire as boolean) ?? true;
    this.login_params = raw.login_params ? new LoginParams(raw.login_params as Record<string, unknown>) : null;
  }
}

@Injectable()
export class SessionKeepAliveSkill extends BaseSkill<SessionKeepAliveParams> {
  private readonly logger = new Logger(SessionKeepAliveSkill.name);
  readonly skillName = 'session_keep_alive';
  readonly description = 'Session monitoring with auto re-login on timeout';
  readonly paramsModel: ParamsCtor<SessionKeepAliveParams> = SessionKeepAliveParams;
  readonly errorStrategy = ErrorStrategy.RETRY;
  readonly maxRetries = 2;

  async execute(params: SessionKeepAliveParams, context?: SkillContext | null): Promise<SkillResult> {
    const start = now();
    const p = params;
    const ctx = context ?? {};

    try {
      const page = ctx.page;
      if (!page) {
        return { status: SkillStatus.FAILED, error_message: 'No browser page in context', duration_ms: ms(start) };
      }

      // 检查心跳 URL
      if (p.heartbeat_url) {
        const response = await page.evaluate(`fetch('${p.heartbeat_url}').then(r => r.status)`);
        if (response !== 200) {
          this.logger.warn(`Session heartbeat failed: status=${response}`);
          if (p.relogin_on_expire && p.login_params) {
            const loginSkill = new LoginSkill();
            return loginSkill.execute(p.login_params, context);
          }
        }
      }

      // 检查页面内容里的会话超时指示
      if (p.session_timeout_indicator) {
        const content = await page.content();
        if (content.toLowerCase().includes(p.session_timeout_indicator.toLowerCase())) {
          this.logger.warn('Session expired (indicator found in page)');
          if (p.relogin_on_expire && p.login_params) {
            const loginSkill = new LoginSkill();
            return loginSkill.execute(p.login_params, context);
          }
          return {
            status: SkillStatus.FAILED,
            error_message: 'Session expired and no re-login configured',
            duration_ms: ms(start),
          };
        }
      }

      return { status: SkillStatus.COMPLETED, data: { session_active: true }, duration_ms: ms(start) };
    } catch (e) {
      this.logger.error(`SessionKeepAliveSkill failed: ${e}`);
      return { status: SkillStatus.FAILED, error_message: e instanceof Error ? e.message : String(e), duration_ms: ms(start) };
    }
  }
}
