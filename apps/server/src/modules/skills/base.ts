// Skill 统一抽象基类 + 结果/状态类型 + 脱敏。
//
// 每个 Skill 自带：参数校验（paramsModel 构造器填默认值）、execute、错误策略（静态属性）、
// 审计输出（toAuditDict 脱敏）。skill 无状态，用 DI 单例实例读元数据。
// 注册表用 NestJS DI 装配（见 skill-registry.service）。

/// Skill 执行失败时怎么处理。
export enum ErrorStrategy {
  RETRY = 'retry',
  SKIP = 'skip',
  ABORT = 'abort',
}

/// Skill 调用的执行状态。
export enum SkillStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

/// 任意 skill 执行的标准化结果。
export interface SkillResult {
  status: SkillStatus;
  data?: Record<string, unknown> | null;
  error_message?: string | null;
  screenshots?: string[] | null; // MinIO keys（只存 key 不存二进制）
  duration_ms?: number | null;
}

/// toAuditDict 的输出。
export interface AuditEntry {
  skill: string;
  params: Record<string, unknown>;
}

// skill 的 execute 面向这个鸭子类型接口编程，不依赖真实浏览器。
// 方法集 = 7 个 skill 实际用到的最小集。

export interface ElementHandle {
  evaluate(fn: string): Promise<unknown>;
  click(): Promise<void>;
  innerText(): Promise<string>;
}

export interface DownloadWaiter {
  value(): Promise<{ suggested_filename: string; save_as(path: string): Promise<void> }>;
}

export interface BrowserPage {
  goto(url: string, opts?: { waitUntil?: string }): Promise<void>;
  fill(selector: string, value: string): Promise<void>;
  click(selector: string): Promise<void>;
  content(): Promise<string>;
  waitForURL(pattern: string, opts?: { timeout?: number }): Promise<void>;
  querySelector(selector: string): Promise<ElementHandle | null>;
  querySelectorAll(selector: string): Promise<ElementHandle[]>;
  selectOption(selector: string, value: string): Promise<void>;
  waitForTimeout(ms: number): Promise<void>;
  evaluate(fn: string, args?: unknown): Promise<unknown>;
  keyboard: { press(key: string): Promise<void> };
  expectDownload(opts?: { timeout?: number }): DownloadWaiter;
}

/// LLM 引导的元素操作。
export type LlmHandler = (page: BrowserPage, goal: string) => Promise<void>;

/// Skill 执行上下文。
export interface SkillContext {
  page?: BrowserPage;
  llm_handler?: LlmHandler;
  [key: string]: unknown;
}

/// params 模型构造器：接收原始 dict，产出填好默认值的参数对象。
export type ParamsCtor<T extends object> = new (raw?: Record<string, unknown>) => T;

/// 所有可组合 skill 的抽象基类。
export abstract class BaseSkill<TParams extends object = Record<string, unknown>> {
  abstract readonly skillName: string;
  abstract readonly description: string;
  abstract readonly paramsModel: ParamsCtor<TParams>;
  readonly errorStrategy: ErrorStrategy = ErrorStrategy.RETRY;
  readonly maxRetries: number = 2;

  /// 用参数模型校验原始参数（构造即填默认值）。
  validateParams(raw: Record<string, unknown> = {}): TParams {
    return new this.paramsModel(raw);
  }

  /// 执行 skill。
  abstract execute(params: TParams, context?: SkillContext | null): Promise<SkillResult>;

  /// 脱敏后的审计表示。
  /// 局限：靠字段名硬编码，cardNo/idCard/phone 会漏。
  /// 改善方向见 [[02-skill-abstraction]]：@Sensitive() 装饰器（属改 bug，本次不做）。
  toAuditDict(params: TParams): AuditEntry {
    const data: Record<string, unknown> = { ...(params as Record<string, unknown>) };
    const keywords = ['password', 'secret', 'token', 'key'];
    for (const k of Object.keys(data)) {
      const lower = k.toLowerCase();
      if (keywords.some((w) => lower.includes(w))) {
        const val = String(data[k]);
        data[k] = val.length > 4 ? val[0] + '*'.repeat(val.length - 2) + val[val.length - 1] : '****';
      }
    }
    return { skill: this.skillName, params: data };
  }
}
