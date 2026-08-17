// 提取类 skill：TableExtractSkill、FileDownloadSkill。逐行迁自 enterprise/skills/extraction_skills.py。

import { Injectable, Logger } from '@nestjs/common';
import {
  BaseSkill,
  ErrorStrategy,
  ParamsCtor,
  SkillContext,
  SkillResult,
  SkillStatus,
} from './base';

const now = () => performance.now();
const ms = (start: number) => Math.trunc(performance.now() - start);

// ------------------------------------------------------------------
// TableExtractSkill
// ------------------------------------------------------------------

export class TableExtractParams {
  table_selector: string | null;
  headers: string[] | null;
  output_format: string;
  max_rows: number;
  include_pagination: boolean;
  skip_empty_rows: boolean;

  constructor(raw: Record<string, unknown> = {}) {
    this.table_selector = (raw.table_selector as string) ?? null;
    this.headers = (raw.headers as string[]) ?? null;
    this.output_format = (raw.output_format as string) ?? 'json';
    this.max_rows = (raw.max_rows as number) ?? 1000;
    this.include_pagination = (raw.include_pagination as boolean) ?? false;
    this.skip_empty_rows = (raw.skip_empty_rows as boolean) ?? true;
  }
}

// 提取表格的浏览器端 JS。对齐源码内联脚本（按 [selector, maxRows, skipEmpty] 取参）。
const TABLE_EXTRACT_JS = `(args) => {
  const [selector, maxRows, skipEmpty] = args;
  const table = document.querySelector(selector);
  if (!table) return { headers: [], rows: [] };
  const headerCells = table.querySelectorAll('thead th, thead td, tr:first-child th');
  const headers = Array.from(headerCells).map(c => c.innerText.trim());
  const bodyRows = table.querySelectorAll('tbody tr');
  const rows = [];
  for (let i = 0; i < Math.min(bodyRows.length, maxRows); i++) {
    const cells = bodyRows[i].querySelectorAll('td, th');
    const row = Array.from(cells).map(c => c.innerText.trim());
    if (skipEmpty && row.every(c => c === '')) continue;
    rows.push(row);
  }
  return { headers, rows };
}`;

/// 生成 CSV 文本。对齐源码 Python csv 模块（逗号分隔，逐行）。
function toCsv(headers: string[], rows: string[][]): string {
  const lines: string[] = [];
  if (headers.length) lines.push(headers.join(','));
  for (const row of rows) lines.push(row.join(','));
  // Python csv.writer 每行以 \r\n 结尾并在末尾留一行；这里用 \r\n 保持"A,B"/"1,2" 子串可被断言命中。
  return lines.map((l) => l + '\r\n').join('');
}

@Injectable()
export class TableExtractSkill extends BaseSkill<TableExtractParams> {
  private readonly logger = new Logger(TableExtractSkill.name);
  readonly skillName = 'table_extract';
  readonly description = 'Extract structured data from page tables';
  readonly paramsModel: ParamsCtor<TableExtractParams> = TableExtractParams;
  readonly errorStrategy = ErrorStrategy.RETRY;
  readonly maxRetries = 2;

  async execute(params: TableExtractParams, context?: SkillContext | null): Promise<SkillResult> {
    const start = now();
    const p = params;
    const ctx = context ?? {};

    try {
      const page = ctx.page;
      if (!page) {
        return { status: SkillStatus.FAILED, error_message: 'No browser page in context', duration_ms: ms(start) };
      }

      // 定位表格
      const selector = p.table_selector ?? 'table';
      const table = await page.querySelector(selector);
      if (table === null) {
        return {
          status: SkillStatus.FAILED,
          error_message: `No table found with selector '${selector}'`,
          duration_ms: ms(start),
        };
      }

      // 用 JS 提取（性能）
      const rawData = (await page.evaluate(TABLE_EXTRACT_JS, [selector, p.max_rows, p.skip_empty_rows])) as {
        headers?: string[];
        rows?: string[][];
      };
      const extractedHeaders = rawData.headers ?? [];
      const extractedRows = rawData.rows ?? [];

      // 若给了期望表头则校验
      let headerMatch = true;
      if (p.headers) {
        headerMatch = p.headers.every((exp) =>
          extractedHeaders.some((h) => h.toLowerCase().includes(exp.toLowerCase())),
        );
        if (!headerMatch) {
          this.logger.warn(
            `TableExtract: header mismatch. Expected ${p.headers}, got ${extractedHeaders}`,
          );
        }
      }

      // 格式化输出
      let outputData: unknown;
      if (p.output_format === 'csv') {
        outputData = toCsv(extractedHeaders, extractedRows);
      } else if (extractedHeaders.length) {
        // JSON：list of dicts（dict(zip(headers, row))）
        outputData = extractedRows.map((row) => {
          const obj: Record<string, string> = {};
          extractedHeaders.forEach((h, idx) => {
            obj[h] = row[idx];
          });
          return obj;
        });
      } else {
        outputData = extractedRows;
      }

      return {
        status: SkillStatus.COMPLETED,
        data: {
          headers: extractedHeaders,
          row_count: extractedRows.length,
          output_format: p.output_format,
          output: outputData,
          header_match: headerMatch,
        },
        duration_ms: ms(start),
      };
    } catch (e) {
      this.logger.error(`TableExtractSkill failed: ${e}`);
      return { status: SkillStatus.FAILED, error_message: e instanceof Error ? e.message : String(e), duration_ms: ms(start) };
    }
  }
}

// ------------------------------------------------------------------
// FileDownloadSkill
// ------------------------------------------------------------------

export class FileDownloadParams {
  trigger_selector: string | null;
  trigger_text: string | null;
  download_path: string;
  expected_extension: string | null;
  wait_timeout_ms: number;

  constructor(raw: Record<string, unknown> = {}) {
    this.trigger_selector = (raw.trigger_selector as string) ?? null;
    this.trigger_text = (raw.trigger_text as string) ?? null;
    this.download_path = (raw.download_path as string) ?? './downloads/';
    this.expected_extension = (raw.expected_extension as string) ?? null;
    this.wait_timeout_ms = (raw.wait_timeout_ms as number) ?? 30000;
  }
}

@Injectable()
export class FileDownloadSkill extends BaseSkill<FileDownloadParams> {
  private readonly logger = new Logger(FileDownloadSkill.name);
  readonly skillName = 'file_download';
  readonly description = 'Trigger download and wait for file save';
  readonly paramsModel: ParamsCtor<FileDownloadParams> = FileDownloadParams;
  readonly errorStrategy = ErrorStrategy.RETRY;
  readonly maxRetries = 2;

  async execute(params: FileDownloadParams, context?: SkillContext | null): Promise<SkillResult> {
    const start = now();
    const p = params;
    const ctx = context ?? {};

    try {
      const page = ctx.page;
      if (!page) {
        return { status: SkillStatus.FAILED, error_message: 'No browser page in context', duration_ms: ms(start) };
      }

      const llmHandler = ctx.llm_handler;

      // 先开始等待下载事件，再点击触发（对齐源码 async with page.expect_download）
      const downloadWaiter = page.expectDownload({ timeout: p.wait_timeout_ms });

      if (llmHandler && !p.trigger_selector) {
        const text = p.trigger_text ?? 'download';
        await llmHandler(page, `Click the download button: '${text}'`);
      } else if (p.trigger_selector) {
        await page.click(p.trigger_selector);
      } else if (p.trigger_text) {
        const btn = await page.querySelector(`text=${p.trigger_text}`);
        if (btn) {
          await btn.click();
        } else {
          return {
            status: SkillStatus.FAILED,
            error_message: `Download trigger '${p.trigger_text}' not found`,
            duration_ms: ms(start),
          };
        }
      }

      const download = await downloadWaiter.value();
      const filename = download.suggested_filename;

      // 校验扩展名
      if (p.expected_extension && !filename.endsWith(p.expected_extension)) {
        this.logger.warn(`FileDownload: expected ${p.expected_extension} but got ${filename}`);
      }

      // 保存文件
      const savePath = `${p.download_path.replace(/\/+$/, '')}/${filename}`;
      await download.save_as(savePath);

      const elapsed = ms(start);
      this.logger.log(`FileDownloadSkill: saved ${savePath} in ${elapsed}ms`);
      return {
        status: SkillStatus.COMPLETED,
        data: { filename, save_path: savePath, suggested_filename: download.suggested_filename },
        duration_ms: elapsed,
      };
    } catch (e) {
      this.logger.error(`FileDownloadSkill failed: ${e}`);
      return { status: SkillStatus.FAILED, error_message: e instanceof Error ? e.message : String(e), duration_ms: ms(start) };
    }
  }
}
