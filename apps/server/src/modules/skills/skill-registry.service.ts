// Skill 注册表：用 NestJS DI 装配。这里构造时注入全部 skill provider，装配显式且确定。

import { Injectable } from '@nestjs/common';
import { BaseSkill } from './base';
import { LoginSkill, SessionKeepAliveSkill } from './auth-skills';
import { FormFillSkill, PaginationSkill, SearchAndSelectSkill } from './interaction-skills';
import { FileDownloadSkill, TableExtractSkill } from './extraction-skills';

/// list_skills() 返回的元数据形状。
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

  /// 按名字取 skill 实例。 DI 单例返回实例（skill 无状态，等价）。
  getSkill(name: string): BaseSkill<any> | null {
    return this.registry.get(name) ?? null;
  }

  /// 列出全部 skill 元数据。
  listSkills(): SkillMeta[] {
    return Array.from(this.registry.values()).map((s) => ({
      name: s.skillName,
      description: s.description,
      error_strategy: s.errorStrategy,
    }));
  }
}


