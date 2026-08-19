// Skill 管道执行器：顺序执行一串 skill，带错误处理/重试/审计。
// 以便注入 SkillRegistryService 查 skill。

import { Injectable, Logger } from '@nestjs/common';
import { ErrorStrategy, SkillContext, SkillResult, SkillStatus } from './base';
import { SkillRegistryService } from './skill-registry.service';

/// 管道里的一步。
export interface SkillStep {
  skill_name: string;
  params: Record<string, unknown>;
  description?: string;
  error_strategy_override?: string | null;
}

/// 每步结果记录（写入 PipelineResult.step_results）。
export interface StepRecord {
  step: number;
  skill: string;
  status: string;
  duration_ms?: number | null;
  data?: Record<string, unknown> | null;
  error?: string;
}

/// 执行整条管道的结果。
export interface PipelineResult {
  success: boolean;
  steps_completed: number;
  steps_total: number;
  step_results: StepRecord[];
  total_duration_ms: number;
  aborted_at_step: number | null;
  error_message: string | null;
}

/// 审计回调。
export type PipelineAuditCallback = (
  stepIndex: number,
  skillName: string,
  paramsDict: Record<string, unknown>,
  result: SkillResult,
) => Promise<void>;

@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  constructor(private readonly registry: SkillRegistryService) {}

  async executePipeline(
    steps: SkillStep[],
    context?: SkillContext | null,
    auditCallback?: PipelineAuditCallback | null,
  ): Promise<PipelineResult> {
    const pipelineStart = performance.now();
    const result: PipelineResult = {
      success: true,
      steps_completed: 0,
      steps_total: steps.length,
      step_results: [],
      total_duration_ms: 0,
      aborted_at_step: null,
      error_message: null,
    };

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const skill = this.registry.getSkill(step.skill_name);
      if (skill === null) {
        this.logger.error(`Unknown skill: ${step.skill_name} (step ${i})`);
        result.step_results.push({
          step: i,
          skill: step.skill_name,
          status: 'failed',
          error: `Unknown skill: ${step.skill_name}`,
        });
        result.success = false;
        result.aborted_at_step = i;
        result.error_message = `Unknown skill: ${step.skill_name}`;
        break;
      }

      const errorStrategy = step.error_strategy_override
        ? (step.error_strategy_override as ErrorStrategy)
        : skill.errorStrategy;

      // 校验参数
      let validatedParams: object;
      try {
        validatedParams = skill.validateParams(step.params);
      } catch (e) {
        this.logger.error(`Param validation failed for ${step.skill_name}: ${e}`);
        result.step_results.push({
          step: i,
          skill: step.skill_name,
          status: 'failed',
          error: `Invalid params: ${e instanceof Error ? e.message : String(e)}`,
        });
        if (errorStrategy === ErrorStrategy.ABORT) {
          result.success = false;
          result.aborted_at_step = i;
          result.error_message = `Param validation failed at step ${i}`;
          break;
        }
        continue;
      }

      // 带重试执行
      const maxAttempts = errorStrategy === ErrorStrategy.RETRY ? skill.maxRetries + 1 : 1;
      let skillResult: SkillResult | null = null;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        skillResult = await skill.execute(validatedParams as never, context);
        if (skillResult.status === SkillStatus.COMPLETED) break;
        if (attempt < maxAttempts - 1) {
          this.logger.log(`Retrying ${step.skill_name} (attempt ${attempt + 2}/${maxAttempts})`);
        }
      }

      // skillResult 一定非空（至少跑一次）
      const res = skillResult as SkillResult;

      // 记录步骤结果
      const stepRecord: StepRecord = {
        step: i,
        skill: step.skill_name,
        status: res.status,
        duration_ms: res.duration_ms,
        data: res.data,
      };
      if (res.error_message) stepRecord.error = res.error_message;
      result.step_results.push(stepRecord);

      // 审计回调（包 try/catch）
      if (auditCallback) {
        try {
          const auditDict = skill.toAuditDict(validatedParams as never);
          await auditCallback(i, step.skill_name, auditDict as unknown as Record<string, unknown>, res);
        } catch (e) {
          this.logger.warn(`Audit callback failed for step ${i}: ${e}`);
        }
      }

      // 按错误策略处理失败
      if (res.status === SkillStatus.FAILED || res.status === SkillStatus.SKIPPED) {
        if (res.status === SkillStatus.FAILED) {
          if (errorStrategy === ErrorStrategy.ABORT) {
            result.success = false;
            result.aborted_at_step = i;
            result.error_message = `Step ${i} (${step.skill_name}) failed: ${res.error_message}`;
            break;
          } else if (errorStrategy === ErrorStrategy.SKIP) {
            this.logger.log(`Skipping failed step ${i} (${step.skill_name})`);
            continue;
          }
        }
        // RETRY 耗尽落到这里
        if (errorStrategy === ErrorStrategy.RETRY && res.status === SkillStatus.FAILED) {
          result.success = false;
          result.aborted_at_step = i;
          result.error_message = `Step ${i} (${step.skill_name}) failed after retries: ${res.error_message}`;
          break;
        }
      }

      result.steps_completed += 1;
    }

    result.total_duration_ms = Math.trunc(performance.now() - pipelineStart);
    return result;
  }
}
