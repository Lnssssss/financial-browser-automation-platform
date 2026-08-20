// 三层容错的 LLM 调用器。
//   第 1 层（Prompt）：用系统提示词 + schema 逼模型输出结构化 JSON
//   第 2 层（Parse）：解析 + schema 校验 + markdown 清洗 + 指数退避重试
//   第 3 层（Task）：重试耗尽后，把任务转入 needs_human 交人工
//
// 本项目零新依赖铁律：不引 zod，手写最小 ResponseSchema —— 字段描述表既能渲染成
// schema 文本喂给模型，又能校验解析结果。守住 Pydantic 在这里真正用到的两个能力。

/// 字段类型。integer 额外要求整数，number 接受任意数值。
export type FieldType = 'string' | 'number' | 'integer' | 'boolean';

export interface FieldSpec {
  type: FieldType;
  required?: boolean; // 默认 true
}

export type SchemaShape = Record<string, FieldSpec>;

/// schema 校验失败（等价 Pydantic ValidationError）。
export class SchemaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaValidationError';
  }
}

/// JSON 解析失败（等价 json.JSONDecodeError）。
export class JsonParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JsonParseError';
  }
}

/// 最小响应 schema：字段描述 -> 生成 JSON Schema（喂 prompt）+ 校验解析结果。
/// 顶掉 Pydantic 在 resilient_caller 里真正用到的两个能力，不引第三方库。
export class ResponseSchema<T = Record<string, unknown>> {
  constructor(
    public readonly name: string,
    public readonly shape: SchemaShape,
  ) {}

  /// 生成 JSON Schema 对象（渲染进 prompt，让模型知道要产出什么形状）。
  jsonSchema(): Record<string, unknown> {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [field, spec] of Object.entries(this.shape)) {
      properties[field] = { type: spec.type === 'integer' ? 'integer' : spec.type };
      if (spec.required ?? true) required.push(field);
    }
    return { title: this.name, type: 'object', properties, required };
  }

  /// 校验解析后的数据是否匹配 schema。不匹配抛 SchemaValidationError。
  /// 逐字段查：必填缺失、类型不符都记进错误串一次性报出。
  validate(data: unknown): T {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new SchemaValidationError('expected a JSON object');
    }
    const obj = data as Record<string, unknown>;
    const errors: string[] = [];

    for (const [field, spec] of Object.entries(this.shape)) {
      const present = field in obj;
      if (!present) {
        if (spec.required ?? true) errors.push(`missing required field '${field}'`);
        continue;
      }
      if (!matchesType(obj[field], spec.type)) {
        errors.push(`field '${field}' expected ${spec.type}`);
      }
    }

    if (errors.length > 0) {
      throw new SchemaValidationError(errors.join('; '));
    }
    return obj as T;
  }
}

function matchesType(value: unknown, type: FieldType): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'boolean':
      return typeof value === 'boolean';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
  }
}

// ── 三层容错主体 ─────────────────────────────────────────────

/// 异步 LLM 调用签名：接收 prompt，返回原始文本。
export type LlmCallable = (prompt: string) => Promise<string>;

/// 指数退避延迟（秒）。
export const RETRY_DELAYS = [1.0, 2.0, 4.0];
export const MAX_RETRIES = 3;

/// 一次三层容错调用的结果。
export interface LLMCallResult<T = unknown> {
  success: boolean;
  data: T | null; // 校验通过的对象
  raw_response: string | null;
  attempts: number;
  errors: string[];
  needs_human: boolean;
}

/// 剥离 markdown 代码围栏的正则。JS 无 DOTALL 标志，用 [\s\S] 代替 . 匹配换行。
const MARKDOWN_FENCE_RE = /^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/;

/// 第 1 层：构造逼模型输出 JSON 的系统提示词，把 schema 内联进去。
export function buildStructuredPrompt(
  taskDescription: string,
  schema: ResponseSchema,
  additionalContext = '',
): string {
  const schemaJson = JSON.stringify(schema.jsonSchema(), null, 2);

  let prompt =
    'You are a financial RPA assistant. You MUST respond with valid JSON ' +
    'matching the following schema. Do NOT include any text outside the JSON object.\n\n' +
    `## Required JSON Schema\n\`\`\`json\n${schemaJson}\n\`\`\`\n\n`;

  if (additionalContext) {
    prompt += `## Context\n${additionalContext}\n\n`;
  }

  prompt += `## Task\n${taskDescription}\n`;
  return prompt;
}

/// 第 2 层：剥掉 markdown 围栏与首尾空白。
export function cleanLlmResponse(raw: string): string {
  let text = raw.trim();
  const match = MARKDOWN_FENCE_RE.exec(text);
  if (match) {
    text = match[1].trim();
  }
  return text;
}

/// 第 2 层：解析 JSON 并按 schema 校验。
/// JSON 非法抛 JsonParseError；结构不符抛 SchemaValidationError。
export function parseAndValidate<T>(raw: string, schema: ResponseSchema<T>): T {
  const cleaned = cleanLlmResponse(raw);
  let data: unknown;
  try {
    data = JSON.parse(cleaned);
  } catch (e) {
    throw new JsonParseError(e instanceof Error ? e.message : String(e));
  }
  return schema.validate(data);
}

/// 第 1+2 层：带指数退避重试的 LLM 调用。
/// 每次尝试：调 llm -> 清洗 -> 解析校验；成功即返回。三类错误分别记录、退避后重试。
/// 全部耗尽 -> needs_human=true（第 3 层交人工的信号，实际转态由上层执行器做）。
export async function callLlmWithRetry<T>(
  llmCallable: LlmCallable,
  prompt: string,
  schema: ResponseSchema<T>,
  maxRetries: number = MAX_RETRIES,
  retryDelays: number[] | null = null,
): Promise<LLMCallResult<T>> {
  const delays = retryDelays ?? RETRY_DELAYS.slice(0, maxRetries);

  const result: LLMCallResult<T> = {
    success: false,
    data: null,
    raw_response: null,
    attempts: 0,
    errors: [],
    needs_human: false,
  };

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    result.attempts = attempt + 1;

    try {
      const rawResponse = await llmCallable(prompt);
      result.raw_response = rawResponse;

      const parsed = parseAndValidate(rawResponse, schema);
      result.success = true;
      result.data = parsed;
      return result;
    } catch (e) {
      result.errors.push(formatAttemptError(attempt + 1, e));
    }

    // 指数退避后再试（最后一次尝试后不等待）
    if (attempt < maxRetries - 1) {
      const delay = delays[Math.min(attempt, delays.length - 1)];
      await sleep(delay);
    }
  }

  // 重试耗尽 -> 交人工
  result.needs_human = true;
  return result;
}

/// 把一次尝试的错误按类型格式化（保留错误类型名，便于排查）。
function formatAttemptError(attempt: number, e: unknown): string {
  if (e instanceof JsonParseError) {
    return `Attempt ${attempt}: JSON parse error — ${e.message}`;
  }
  if (e instanceof SchemaValidationError) {
    return `Attempt ${attempt}: Schema validation error — ${e.message}`;
  }
  const name = e instanceof Error ? e.name || e.constructor.name : typeof e;
  const msg = e instanceof Error ? e.message : String(e);
  return `Attempt ${attempt}: LLM call error — ${name}: ${msg}`;
}

/// 退避睡眠（秒）。retry_delays=[0,0,0] 时立即返回，测试可零延迟跑完。
function sleep(seconds: number): Promise<void> {
  if (seconds <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}
