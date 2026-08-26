// 通知渠道实现：把载荷通过 HTTP webhook 投递到企业微信 / 钉钉。
// 渠道是无状态的，只负责「发一个 payload、把平台响应翻译成统一的 SendResult」。
//
// HTTP 调用抽象成 HttpPoster 接口（interface-first）：默认实现用 Node20 全局 fetch +
// AbortController 做超时；单测可注入假的 poster，无需真实网络。

import { Injectable } from '@nestjs/common';
import { CHANNEL_WECOM, CHANNEL_DINGTALK } from './notification.types';
import type { SendResult } from './notification.types';

/// webhook 请求超时（毫秒）。此处取 10s 作整体超时。
export const WEBHOOK_TIMEOUT_MS = 10_000;

/// HTTP POST 的最小抽象。只暴露发送所需的字段，屏蔽底层 fetch/axios 差异。
export interface HttpResponse {
  status: number;
  text: string;
}

export interface HttpPoster {
  post(url: string, json: unknown, timeoutMs: number): Promise<HttpResponse>;
}

/// 基于 Node20 全局 fetch 的默认实现，用 AbortController 施加超时。
export class FetchHttpPoster implements HttpPoster {
  async post(url: string, json: unknown, timeoutMs: number): Promise<HttpResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json),
        signal: controller.signal,
      });
      const text = await resp.text();
      return { status: resp.status, text };
    } finally {
      clearTimeout(timer);
    }
  }
}

/// 把「HTTP 200 + errcode==0」判为成功——企业微信/钉钉成功都返回 {"errcode":0,"errmsg":"ok"}。
/// 抽成一个函数是因为两个渠道的成功判据完全一致，只是 channel 标签不同。
function interpretWebhookResponse(channel: string, resp: HttpResponse): SendResult {
  if (resp.status === 200) {
    try {
      const data = JSON.parse(resp.text) as { errcode?: number; errmsg?: string };
      if ((data.errcode ?? -1) === 0) {
        return { success: true, channel, statusCode: 200, responseBody: resp.text };
      }
      return {
        success: false,
        channel,
        statusCode: 200,
        error: `${channel} API error: ${data.errmsg ?? 'unknown'}`,
        responseBody: resp.text,
      };
    } catch {
      // JSON 解析失败，落到下方按 HTTP 层失败处理
    }
  }

  return {
    success: false,
    channel,
    statusCode: resp.status,
    error: `HTTP ${resp.status}`,
    responseBody: resp.text,
  };
}

/// AbortController.abort 触发的错误名为 'AbortError'，用于区分超时与其他异常。
function isAbortError(e: unknown): boolean {
  return e instanceof Error && e.name === 'AbortError';
}

@Injectable()
export class NotificationChannelsService {
  constructor(private readonly http: HttpPoster = new FetchHttpPoster()) {}

  /// 企业微信（WeCom）webhook 发送。超时/网络错误都收敛成 success=false 的 SendResult，不抛。
  async sendWecom(webhookUrl: string, payload: unknown): Promise<SendResult> {
    return this.send(CHANNEL_WECOM, webhookUrl, payload);
  }

  /// 钉钉（DingTalk）webhook 发送。语义同上。
  async sendDingtalk(webhookUrl: string, payload: unknown): Promise<SendResult> {
    return this.send(CHANNEL_DINGTALK, webhookUrl, payload);
  }

  private async send(channel: string, webhookUrl: string, payload: unknown): Promise<SendResult> {
    try {
      const resp = await this.http.post(webhookUrl, payload, WEBHOOK_TIMEOUT_MS);
      return interpretWebhookResponse(channel, resp);
    } catch (e) {
      if (isAbortError(e)) {
        return { success: false, channel, error: `Timeout: ${String(e)}` };
      }
      return { success: false, channel, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
