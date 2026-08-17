// 交互类 skill：FormFillSkill、SearchAndSelectSkill、PaginationSkill。
// 逐行迁自 enterprise/skills/interaction_skills.py。

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
// FormFillSkill
// ------------------------------------------------------------------

export class FormFillParams {
  field_mapping: Record<string, string>;
  submit_after_fill: boolean;
  submit_selector: string | null;
  date_format: string;

  constructor(raw: Record<string, unknown> = {}) {
    this.field_mapping = (raw.field_mapping as Record<string, string>) ?? {};
    this.submit_after_fill = (raw.submit_after_fill as boolean) ?? true;
    this.submit_selector = (raw.submit_selector as string) ?? null;
    this.date_format = (raw.date_format as string) ?? 'YYYY-MM-DD';
  }
}

@Injectable()
export class FormFillSkill extends BaseSkill<FormFillParams> {
  private readonly logger = new Logger(FormFillSkill.name);
  readonly skillName = 'form_fill';
  readonly description = 'Intelligent form filling with dropdown and date picker support';
  readonly paramsModel: ParamsCtor<FormFillParams> = FormFillParams;
  readonly errorStrategy = ErrorStrategy.RETRY;
  readonly maxRetries = 2;

  async execute(params: FormFillParams, context?: SkillContext | null): Promise<SkillResult> {
    const start = now();
    const p = params;
    const ctx = context ?? {};

    try {
      const page = ctx.page;
      if (!page) {
        return { status: SkillStatus.FAILED, error_message: 'No browser page in context', duration_ms: ms(start) };
      }

      const filledFields: string[] = [];
      const failedFields: string[] = [];
      const llmHandler = ctx.llm_handler;

      for (const [fieldLabel, value] of Object.entries(p.field_mapping)) {
        try {
          if (llmHandler) {
            const goal = `Fill the form field labeled '${fieldLabel}' with value '${value}'`;
            await llmHandler(page, goal);
          } else {
            // 回退：尝试常见选择器
            const selectors = [
              `input[name='${fieldLabel}']`,
              `input[placeholder*='${fieldLabel}']`,
              `textarea[name='${fieldLabel}']`,
              `select[name='${fieldLabel}']`,
            ];
            let filled = false;
            for (const sel of selectors) {
              try {
                const element = await page.querySelector(sel);
                if (element) {
                  const tag = await element.evaluate('el => el.tagName.toLowerCase()');
                  if (tag === 'select') {
                    await page.selectOption(sel, value);
                  } else {
                    await page.fill(sel, value);
                  }
                  filled = true;
                  break;
                }
              } catch {
                continue;
              }
            }
            if (!filled) {
              failedFields.push(fieldLabel);
              continue;
            }
          }
          filledFields.push(fieldLabel);
        } catch (e) {
          this.logger.warn(`FormFill: failed to fill '${fieldLabel}': ${e}`);
          failedFields.push(fieldLabel);
        }
      }

      // 若要求提交且无失败字段
      if (p.submit_after_fill && failedFields.length === 0) {
        try {
          if (p.submit_selector) {
            await page.click(p.submit_selector);
          } else if (llmHandler) {
            await llmHandler(page, 'Click the submit or confirm button');
          } else {
            await page.click("button[type='submit'], input[type='submit']");
          }
        } catch (e) {
          this.logger.warn(`FormFill: submit click failed: ${e}`);
        }
      }

      const status = failedFields.length === 0 ? SkillStatus.COMPLETED : SkillStatus.FAILED;
      return {
        status,
        data: {
          filled_fields: filledFields,
          failed_fields: failedFields,
          total: Object.keys(p.field_mapping).length,
        },
        error_message: failedFields.length ? `Failed to fill: ${failedFields}` : null,
        duration_ms: ms(start),
      };
    } catch (e) {
      this.logger.error(`FormFillSkill failed: ${e}`);
      return { status: SkillStatus.FAILED, error_message: e instanceof Error ? e.message : String(e), duration_ms: ms(start) };
    }
  }
}

// ------------------------------------------------------------------
// SearchAndSelectSkill
// ------------------------------------------------------------------

export class SearchAndSelectParams {
  search_text: string;
  target_text: string;
  search_selector: string | null;
  result_container_selector: string | null;
  wait_for_results_ms: number;

  constructor(raw: Record<string, unknown> = {}) {
    this.search_text = (raw.search_text as string) ?? '';
    this.target_text = (raw.target_text as string) ?? '';
    this.search_selector = (raw.search_selector as string) ?? null;
    this.result_container_selector = (raw.result_container_selector as string) ?? null;
    this.wait_for_results_ms = (raw.wait_for_results_ms as number) ?? 3000;
  }
}

@Injectable()
export class SearchAndSelectSkill extends BaseSkill<SearchAndSelectParams> {
  private readonly logger = new Logger(SearchAndSelectSkill.name);
  readonly skillName = 'search_and_select';
  readonly description = 'Search and select item from results list';
  readonly paramsModel: ParamsCtor<SearchAndSelectParams> = SearchAndSelectParams;
  readonly errorStrategy = ErrorStrategy.RETRY;
  readonly maxRetries = 2;

  async execute(params: SearchAndSelectParams, context?: SkillContext | null): Promise<SkillResult> {
    const start = now();
    const p = params;
    const ctx = context ?? {};

    try {
      const page = ctx.page;
      if (!page) {
        return { status: SkillStatus.FAILED, error_message: 'No browser page in context', duration_ms: ms(start) };
      }

      const llmHandler = ctx.llm_handler;

      // Step 1: 输入搜索文本
      if (llmHandler) {
        await llmHandler(page, `Find the search box, type '${p.search_text}', and trigger search`);
      } else if (p.search_selector) {
        await page.fill(p.search_selector, p.search_text);
        await page.keyboard.press('Enter');
      } else {
        await page.fill("input[type='search'], input[type='text']", p.search_text);
        await page.keyboard.press('Enter');
      }

      // Step 2: 等待结果
      await page.waitForTimeout(p.wait_for_results_ms);

      // Step 3: 选中目标
      if (llmHandler) {
        await llmHandler(page, `Click on the search result that contains '${p.target_text}'`);
      } else {
        const target = await page.querySelector(`text=${p.target_text}`);
        if (target) {
          await target.click();
        } else {
          return {
            status: SkillStatus.FAILED,
            error_message: `Target '${p.target_text}' not found in results`,
            duration_ms: ms(start),
          };
        }
      }

      return {
        status: SkillStatus.COMPLETED,
        data: { search_text: p.search_text, selected: p.target_text },
        duration_ms: ms(start),
      };
    } catch (e) {
      this.logger.error(`SearchAndSelectSkill failed: ${e}`);
      return { status: SkillStatus.FAILED, error_message: e instanceof Error ? e.message : String(e), duration_ms: ms(start) };
    }
  }
}

// ------------------------------------------------------------------
// PaginationSkill
// ------------------------------------------------------------------

export class PaginationParams {
  max_pages: number;
  next_button_selector: string | null;
  next_button_text: string;
  page_data_selector: string | null;
  wait_between_pages_ms: number;
  stop_on_empty: boolean;

  constructor(raw: Record<string, unknown> = {}) {
    this.max_pages = (raw.max_pages as number) ?? 10;
    this.next_button_selector = (raw.next_button_selector as string) ?? null;
    this.next_button_text = (raw.next_button_text as string) ?? '下一页';
    this.page_data_selector = (raw.page_data_selector as string) ?? null;
    this.wait_between_pages_ms = (raw.wait_between_pages_ms as number) ?? 2000;
    this.stop_on_empty = (raw.stop_on_empty as boolean) ?? true;
  }
}

@Injectable()
export class PaginationSkill extends BaseSkill<PaginationParams> {
  private readonly logger = new Logger(PaginationSkill.name);
  readonly skillName = 'pagination';
  readonly description = 'Multi-page traversal with data collection';
  readonly paramsModel: ParamsCtor<PaginationParams> = PaginationParams;
  readonly errorStrategy = ErrorStrategy.SKIP;
  readonly maxRetries = 1;

  async execute(params: PaginationParams, context?: SkillContext | null): Promise<SkillResult> {
    const start = now();
    const p = params;
    const ctx = context ?? {};

    try {
      const page = ctx.page;
      if (!page) {
        return { status: SkillStatus.FAILED, error_message: 'No browser page in context', duration_ms: ms(start) };
      }

      let pagesTraversed = 0;
      const pageDataCollection: string[] = [];
      const llmHandler = ctx.llm_handler;

      for (let i = 0; i < p.max_pages; i++) {
        pagesTraversed += 1;

        // 收集当前页数据
        if (p.page_data_selector) {
          const elements = await page.querySelectorAll(p.page_data_selector);
          const pageText: string[] = [];
          for (const el of elements) {
            pageText.push(await el.innerText());
          }
          if (p.stop_on_empty && pageText.length === 0) {
            this.logger.log(`PaginationSkill: empty page at ${i + 1}, stopping`);
            break;
          }
          pageDataCollection.push(...pageText);
        }

        // 翻到下一页
        if (i < p.max_pages - 1) {
          try {
            if (llmHandler) {
              await llmHandler(page, `Click '${p.next_button_text}' to go to next page`);
            } else if (p.next_button_selector) {
              const btn = await page.querySelector(p.next_button_selector);
              if (btn) {
                const isDisabled = await btn.evaluate("el => el.disabled || el.classList.contains('disabled')");
                if (isDisabled) break;
                await btn.click();
              } else {
                break;
              }
            } else {
              const btn = await page.querySelector(`text=${p.next_button_text}`);
              if (btn) {
                await btn.click();
              } else {
                break;
              }
            }
            await page.waitForTimeout(p.wait_between_pages_ms);
          } catch (e) {
            this.logger.log(`PaginationSkill: pagination ended at page ${i + 1}: ${e}`);
            break;
          }
        }
      }

      return {
        status: SkillStatus.COMPLETED,
        data: {
          pages_traversed: pagesTraversed,
          items_collected: pageDataCollection.length,
          data: pageDataCollection,
        },
        duration_ms: ms(start),
      };
    } catch (e) {
      this.logger.error(`PaginationSkill failed: ${e}`);
      return { status: SkillStatus.FAILED, error_message: e instanceof Error ? e.message : String(e), duration_ms: ms(start) };
    }
  }
}
