// Skills 模块：装配 7 个 skill + 注册表 + 管道执行器。
// 每个 skill 是一个 provider，SkillRegistryService 构造时注入全部（显式 DI 装配，
// 替代源码 @register_skill 的 import 副作用）。真实 page 来源留到 Stage 4（见 ADR-003）。

import { Module } from '@nestjs/common';
import { LoginSkill, SessionKeepAliveSkill } from './auth-skills';
import { FormFillSkill, PaginationSkill, SearchAndSelectSkill } from './interaction-skills';
import { FileDownloadSkill, TableExtractSkill } from './extraction-skills';
import { SkillRegistryService } from './skill-registry.service';
import { PipelineService } from './pipeline.service';

const SKILLS = [
  LoginSkill,
  SessionKeepAliveSkill,
  FormFillSkill,
  SearchAndSelectSkill,
  PaginationSkill,
  TableExtractSkill,
  FileDownloadSkill,
];

@Module({
  providers: [...SKILLS, SkillRegistryService, PipelineService],
  exports: [SkillRegistryService, PipelineService],
})
export class SkillsModule {}
