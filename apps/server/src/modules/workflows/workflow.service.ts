// 工作流模板服务：查模板、实例化模板为任务。
// 实例化 = 校验参数 → 敏感项加密存储/掩码展示 → 补默认值 → 生成 task_id。

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ParamCryptoService } from './param-crypto.service';
import {
  getTemplate,
  getTemplatesByIndustry,
  TEMPLATE_REGISTRY,
} from './workflow-templates';
import { WorkflowTemplate } from './workflow.schemas';
import { validateParameters, ValidationResult } from './workflow-validator';

/// 实例化结果：入库快照 + 掩码展示。
export interface InstantiateResult {
  task_id: string;
  template_id: string;
  template_name: string;
  stored_parameters: Record<string, string>; // 敏感值已掩码（用于返回展示）
  validation_passed: boolean;
  message: string;
}

/// 参数校验失败。调用方转 422。errors 拼成人类可读串。
export class WorkflowValidationError extends Error {
  constructor(public readonly result: ValidationResult) {
    const detail = result.errors.map((e) => `${e.param_name}: ${e.message}`).join('; ');
    super(`Parameter validation failed: ${detail}`);
    this.name = 'WorkflowValidationError';
  }
}

/// 模板不存在。调用方转 404。
export class TemplateNotFoundError extends Error {
  constructor(public readonly templateId: string) {
    super(`Template ${templateId} not found`);
    this.name = 'TemplateNotFoundError';
  }
}

@Injectable()
export class WorkflowService {
  constructor(private readonly crypto: ParamCryptoService) {}

  /// 列出全部模板，或按行业过滤。
  listTemplates(industry?: string | null): WorkflowTemplate[] {
    if (industry) return getTemplatesByIndustry(industry);
    return Object.values(TEMPLATE_REGISTRY);
  }

  /// 取模板详情，不存在抛 TemplateNotFoundError。
  getTemplateOrThrow(templateId: string): WorkflowTemplate {
    const template = getTemplate(templateId);
    if (!template) throw new TemplateNotFoundError(templateId);
    return template;
  }

  /// 从模板实例化一个任务：校验 → 加密敏感项 → 补默认值 → 生成 task_id。
  /// 返回的 stored_parameters 是【掩码后】的展示视图，真正入库的是加密值（此处未接 DB，
  /// 加密值只在内部构造，展示层永远拿掩码）。
  instantiate(
    templateId: string,
    params: Record<string, string>,
  ): InstantiateResult {
    const template = this.getTemplateOrThrow(templateId);

    // 1. 校验
    const result = validateParameters(template.parameters, params);
    if (!result.valid) throw new WorkflowValidationError(result);

    // 2. 敏感项加密（内部）+ 掩码（展示）；非敏感原样
    const sensitiveNames = new Set(
      template.parameters.filter((p) => p.sensitive).map((p) => p.name),
    );
    const display: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) {
      if (sensitiveNames.has(key)) {
        this.crypto.encryptValue(value); // 入库快照（此处未持久化，仅示意加密发生）
        display[key] = this.crypto.maskValue(value);
      } else {
        display[key] = value;
      }
    }

    // 3. 补默认值（未提供且有 default 的可选参数）
    for (const pdef of template.parameters) {
      if (!(pdef.name in params) && pdef.default !== undefined && pdef.default !== null) {
        display[pdef.name] = pdef.default;
      }
    }

    // 4. 生成 task_id（生产环境此处会创建真正的执行任务）
    const taskId = `task_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

    return {
      task_id: taskId,
      template_id: templateId,
      template_name: template.name,
      stored_parameters: display,
      validation_passed: true,
      message: `Task created from template '${template.name}'`,
    };
  }
}
