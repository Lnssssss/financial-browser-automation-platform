// 三层容错的 LLM 调用器。
//   第 1 层（Prompt）：用系统提示词 + schema 逼模型输出结构化 JSON
//   第 2 层（Parse）：解析 + schema 校验 + markdown 清洗 + 指数退避重试
//   第 3 层（Task）：重试耗尽后，把任务转入 needs_human 交人工
//
// 结构化 schema 用 zod：z.object 定形状，z.toJSONSchema 渲染成 JSON Schema 文本喂模型，
// schema.parse 做运行时校验（失败抛 ZodError）。zod 一并顶掉「生成 schema 文本」与
// 「校验解析结果」两件事，类型也由 z.infer 自动推导，无需手写 <T> 与形状表同步。

import { z, ZodError, type ZodType } from 'zod';

/// 结构化响应 schema 即一个 zod 类型。用类型别名而非新类，直接吃 zod 原生能力。
/// 泛型 T 由 z.infer 推出，parseAndValidate 的返回值随之带精确类型。
export type ResponseSchema<T = unknown> = ZodType<T>;

/// JSON 解析失败（等价 json.JSONDecodeError）。schema 校验失败用 zod 的 ZodError，不再自造。
export class JsonParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JsonParseError';
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
/// schema 文本由 z.toJSONSchema 从 zod schema 生成（标准 JSON Schema，模型友好）。
export function buildStructuredPrompt(
  taskDescription: string,
  schema: ResponseSchema,
  additionalContext = '',
): string {
  const schemaJson = JSON.stringify(z.toJSONSchema(schema), null, 2);

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

/// 第 2 层：解析 JSON 并按 zod schema 校验。
/// JSON 非法抛 JsonParseError；结构不符抛 zod 的 ZodError。
export function parseAndValidate<T>(raw: string, schema: ResponseSchema<T>): T {
  const cleaned = cleanLlmResponse(raw);
  let data: unknown;
  try {
    data = JSON.parse(cleaned);
  } catch (e) {
    throw new JsonParseError(e instanceof Error ? e.message : String(e));
  }
  return schema.parse(data); // 校验失败抛 ZodError
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
/// zod 的 ZodError 走独立分支，用其 issues 拼出可读的字段级错误摘要。
function formatAttemptError(attempt: number, e: unknown): string {
  if (e instanceof JsonParseError) {
    return `Attempt ${attempt}: JSON parse error — ${e.message}`;
  }
  if (e instanceof ZodError) {
    const summary = e.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    return `Attempt ${attempt}: Schema validation error — ${summary}`;
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
