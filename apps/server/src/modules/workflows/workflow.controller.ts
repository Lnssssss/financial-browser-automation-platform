import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { IsObject } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  TemplateNotFoundError,
  WorkflowService,
  WorkflowValidationError,
} from './workflow.service';
import { ParamDefinition, WorkflowTemplate } from './workflow.schemas';

/// 实例化入参：一坨参数键值。具体每个参数的合法性由 workflow-validator 按模板定义判，
/// 不在 DTO 层做——因为校验规则是【模板驱动】的（每个模板参数不同），DTO 静态注解表达不了。
class InstantiateDto {
  @IsObject()
  parameters!: Record<string, string>;
}

/// 参数定义的对外视图（不含 validation_regex 等内部字段）。
function toParamView(p: ParamDefinition) {
  return {
    name: p.name,
    label: p.label,
    param_type: p.param_type,
    required: p.required ?? true,
    sensitive: p.sensitive ?? false,
    description: p.description ?? '',
    default: p.default ?? null,
  };
}

@UseGuards(JwtAuthGuard)
@Controller('enterprise/workflows')
export class WorkflowController {
  constructor(private readonly workflows: WorkflowService) {}

  /// 列出全部工作流模板，可按行业过滤。
  @Get('templates')
  listTemplates(@Query('industry') industry?: string) {
    const templates = this.workflows.listTemplates(industry);
    return templates.map((t: WorkflowTemplate) => ({
      template_id: t.template_id,
      name: t.name,
      industry: t.industry,
      risk_level: t.risk_level,
      description: t.description,
      tags: t.tags,
    }));
  }

  /// 取某模板详情。不存在 → 404。
  @Get('templates/:templateId')
  getTemplateDetail(@Param('templateId') templateId: string) {
    let template: WorkflowTemplate;
    try {
      template = this.workflows.getTemplateOrThrow(templateId);
    } catch (e) {
      if (e instanceof TemplateNotFoundError) throw new NotFoundException(e.message);
      throw e;
    }
    return {
      template_id: template.template_id,
      name: template.name,
      industry: template.industry,
      risk_level: template.risk_level,
      description: template.description,
      navigation_target: template.navigation_target,
      expected_result: template.expected_result,
      approval_rule: template.approval_rule,
      parameters: template.parameters.map(toParamView),
      tags: template.tags,
    };
  }

  /// 从模板实例化任务。校验失败 → 422；模板不存在 → 404。
  @Post('instantiate/:templateId')
  instantiate(
    @Param('templateId') templateId: string,
    @Body() body: InstantiateDto,
  ) {
    try {
      return this.workflows.instantiate(templateId, body.parameters ?? {});
    } catch (e) {
      if (e instanceof TemplateNotFoundError) throw new NotFoundException(e.message);
      if (e instanceof WorkflowValidationError) throw new UnprocessableEntityException(e.message);
      throw e;
    }
  }
}
