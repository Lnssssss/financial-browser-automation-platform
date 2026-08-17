// Skill 注册表：用 NestJS DI 装配替代源码 @register_skill 全局字典。
// 迁移的最大架构改善点（见 [[02-skill-abstraction]]）：源码靠 import 副作用注册，
// 注册表内容取决于 import 顺序（隐式副作用）；这里构造时注入全部 skill provider，
// 装配显式且确定。公开接口 getSkill / listSkills 与源码保持一致。

import { Injectable } from '@nestjs/common';
import { BaseSkill } from './base';
import { LoginSkill, SessionKeepAliveSkill } from './auth-skills';
import { FormFillSkill, PaginationSkill, SearchAndSelectSkill } from './interaction-skills';
import { FileDownloadSkill, TableExtractSkill } from './extraction-skills';

/// list_skills() 返回的元数据形状。源码 base.py list_skills。
export interface SkillMeta {
  name: string;
  description: string;
  error_strategy: string;
}

@Injectable()
export class SkillRegistryService {
  // 注册表只读元数据/转发 execute，不关心各 skill 的具体 params 类型，故用 BaseSkill<any>。
  private readonly registry = new Map<string, BaseSkill<any>>();

  constructor(
    login: LoginSkill,
    session: SessionKeepAliveSkill,
    formFill: FormFillSkill,
    searchSelect: SearchAndSelectSkill,
    pagination: PaginationSkill,
    tableExtract: TableExtractSkill,
    fileDownload: FileDownloadSkill,
  ) {
    for (const skill of [login, session, formFill, searchSelect, pagination, tableExtract, fileDownload]) {
      this.registry.set(skill.skillName, skill);
    }
  }

  /// 按名字取 skill 实例。源码 get_skill 返回类，这里 DI 单例返回实例（skill 无状态，等价）。
  getSkill(name: string): BaseSkill<any> | null {
    return this.registry.get(name) ?? null;
  }

  /// 列出全部 skill 元数据。源码 list_skills。
  listSkills(): SkillMeta[] {
    return Array.from(this.registry.values()).map((s) => ({
      name: s.skillName,
      description: s.description,
      error_strategy: s.errorStrategy,
    }));
  }
}
