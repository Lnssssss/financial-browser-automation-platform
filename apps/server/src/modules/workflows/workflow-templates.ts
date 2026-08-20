// 内置金融工作流模板。
// 6 个模板覆盖银行(2)、保险(2)、证券(2)：
// - 银行：账单采集、贷款还款提醒查询
// - 保险：理赔状态批量查询、保单续保核查
// - 证券：研报归档、基金净值采集
//
// 每个模板的 skill_steps 首步恒为 login，param_mapping 里 "=" 前缀表示字面值，
// "${xxx}" 表示引用工作流参数（供 pipeline 执行时插值）。

import {
  IndustryType,
  ParamDefinition,
  SkillStepDefinition,
  WorkflowTemplate,
} from './workflow.schemas';

// ============================================================
// 银行模板
// ============================================================

export const BANKING_STATEMENT_COLLECTION: WorkflowTemplate = {
  template_id: 'tpl_banking_statement',
  name: '网银账单自动采集',
  industry: 'banking',
  risk_level: 'medium',
  description:
    '自动登录企业网银系统，按指定日期范围导出银行账单，' +
    '下载对账文件并保存到指定路径。适用于财务对账和税务申报场景。',
  navigation_target: '企业网银系统 - 账户管理 - 电子对账单',
  expected_result: '指定日期范围内的银行账单 CSV/PDF 文件下载到本地',
  approval_rule: 'medium 风险，仅日志记录，无需审批',
  parameters: [
    { name: 'bank_url', label: '网银地址', param_type: 'url', description: '企业网银登录页面 URL' },
    { name: 'username', label: '用户名', param_type: 'string', description: '网银登录用户名' },
    { name: 'password', label: '登录密码', param_type: 'password', sensitive: true, description: '网银登录密码' },
    { name: 'account_number', label: '账号', param_type: 'string', sensitive: true, description: '银行账号' },
    { name: 'start_date', label: '开始日期', param_type: 'date', description: '账单查询起始日期（YYYY-MM-DD）' },
    { name: 'end_date', label: '结束日期', param_type: 'date', description: '账单查询截止日期（YYYY-MM-DD）' },
    {
      name: 'output_path', label: '保存路径', param_type: 'string',
      required: false, default: './downloads/statements/', description: '文件下载保存路径',
    },
  ],
  tags: ['财务对账', '税务申报', '网银'],
  skill_steps: [
    {
      skill_name: 'login', description: '登录企业网银',
      param_mapping: { url: 'bank_url', username: 'username', password: 'password' },
    },
    {
      skill_name: 'form_fill', description: '填写账单查询条件',
      param_mapping: {
        field_mapping: '={"账号": "${account_number}", "开始日期": "${start_date}", "结束日期": "${end_date}"}',
      },
    },
    {
      skill_name: 'table_extract', description: '提取账单数据',
      param_mapping: { output_format: '=csv' },
    },
    {
      skill_name: 'file_download', description: '下载账单文件',
      param_mapping: { download_path: 'output_path', trigger_text: '=导出' },
    },
  ],
};

export const BANKING_LOAN_REMINDER: WorkflowTemplate = {
  template_id: 'tpl_banking_loan_reminder',
  name: '定期贷款还款提醒查询',
  industry: 'banking',
  risk_level: 'low',
  description:
    '批量查询贷款客户的还款计划，提取即将到期（N 天内）的还款记录，' +
    '生成提醒清单供信贷经理跟进。适用于信贷经理批量客户管理。',
  navigation_target: '信贷管理系统 - 贷后管理 - 还款计划查询',
  expected_result: '即将到期的还款记录清单（Excel），包含客户姓名、贷款编号、到期日、应还金额',
  approval_rule: 'low 风险，无需审批',
  parameters: [
    { name: 'system_url', label: '系统地址', param_type: 'url', description: '信贷管理系统 URL' },
    { name: 'username', label: '用户名', param_type: 'string' },
    { name: 'password', label: '登录密码', param_type: 'password', sensitive: true },
    {
      name: 'days_ahead', label: '提前天数', param_type: 'integer',
      default: '7', description: '查询未来 N 天内到期的还款（默认 7 天）',
    },
    {
      name: 'branch_code', label: '网点代码', param_type: 'string',
      required: false, description: '限定特定网点（留空查询全部）',
    },
  ],
  tags: ['贷后管理', '还款提醒', '信贷'],
  skill_steps: [
    {
      skill_name: 'login', description: '登录信贷管理系统',
      param_mapping: { url: 'system_url', username: 'username', password: 'password' },
    },
    {
      skill_name: 'form_fill', description: '填写还款查询条件',
      param_mapping: { field_mapping: '={"提前天数": "${days_ahead}"}' },
    },
    {
      skill_name: 'table_extract', description: '提取还款记录',
      param_mapping: { output_format: '=json' },
    },
  ],
};

// ============================================================
// 保险模板
// ============================================================

export const INSURANCE_CLAIM_QUERY: WorkflowTemplate = {
  template_id: 'tpl_insurance_claim_query',
  name: '理赔案件批量状态查询',
  industry: 'insurance',
  risk_level: 'low',
  description:
    '批量查询理赔案件的处理状态（已受理/审核中/已结案/已拒赔），' +
    '汇总生成状态报告。适用于理赔专员日常作业和部门周报。',
  navigation_target: '核心业务系统 - 理赔管理 - 案件查询',
  expected_result: '理赔案件状态汇总表（Excel），包含案件号、被保险人、状态、预计结案日',
  approval_rule: 'low 风险，无需审批',
  parameters: [
    { name: 'system_url', label: '系统地址', param_type: 'url' },
    { name: 'username', label: '用户名', param_type: 'string' },
    { name: 'password', label: '登录密码', param_type: 'password', sensitive: true },
    { name: 'claim_ids', label: '案件编号列表', param_type: 'string', description: '案件编号，多个以逗号分隔' },
    {
      name: 'status_filter', label: '状态筛选', param_type: 'string',
      required: false, description: '仅查询特定状态（accepted/reviewing/closed/rejected），留空查询全部',
    },
  ],
  tags: ['理赔查询', '案件管理', '日常作业'],
  skill_steps: [
    {
      skill_name: 'login', description: '登录核心业务系统',
      param_mapping: { url: 'system_url', username: 'username', password: 'password' },
    },
    {
      skill_name: 'search_and_select', description: '搜索理赔案件',
      param_mapping: { search_text: 'claim_ids', target_text: 'claim_ids' },
    },
    {
      skill_name: 'table_extract', description: '提取案件状态数据',
      param_mapping: { output_format: '=json' },
    },
  ],
};

export const INSURANCE_RENEWAL_CHECK: WorkflowTemplate = {
  template_id: 'tpl_insurance_renewal',
  name: '保单到期续保提醒核查',
  industry: 'insurance',
  risk_level: 'medium',
  description:
    '查询即将到期的保单清单，核查客户联系方式是否有效，' +
    '生成续保提醒名单。适用于客户经理主动维护和续保率提升。',
  navigation_target: '核心业务系统 - 保单管理 - 到期查询',
  expected_result: '续保提醒名单（Excel），包含保单号、投保人、到期日、联系方式、上年保费',
  approval_rule: 'medium 风险，仅日志记录（涉及客户联系方式查看）',
  parameters: [
    { name: 'system_url', label: '系统地址', param_type: 'url' },
    { name: 'username', label: '用户名', param_type: 'string' },
    { name: 'password', label: '登录密码', param_type: 'password', sensitive: true },
    {
      name: 'days_ahead', label: '到期天数', param_type: 'integer',
      default: '30', description: '查询未来 N 天内到期的保单（默认 30 天）',
    },
    {
      name: 'product_type', label: '险种', param_type: 'string',
      required: false, description: '限定特定险种（留空查询全部）',
    },
  ],
  tags: ['续保提醒', '客户维护', '保单管理'],
  skill_steps: [
    {
      skill_name: 'login', description: '登录核心业务系统',
      param_mapping: { url: 'system_url', username: 'username', password: 'password' },
    },
    {
      skill_name: 'form_fill', description: '填写保单到期查询条件',
      param_mapping: { field_mapping: '={"到期天数": "${days_ahead}"}' },
    },
    {
      skill_name: 'table_extract', description: '提取续保清单',
      param_mapping: { output_format: '=json' },
    },
  ],
};

// ============================================================
// 证券模板
// ============================================================

export const SECURITIES_REPORT_ARCHIVE: WorkflowTemplate = {
  template_id: 'tpl_securities_report',
  name: '研报数据自动归档',
  industry: 'securities',
  risk_level: 'low',
  description:
    '自动从研报平台（如 Wind、东方财富等）下载指定行业或公司的最新研报，' +
    '按日期和行业分类归档。适用于投研部门的信息整合。',
  navigation_target: '研报数据平台 - 研报中心 - 行业/个股研报',
  expected_result: '研报文件按 {日期}/{行业}/ 目录结构归档，生成索引清单',
  approval_rule: 'low 风险，无需审批',
  parameters: [
    { name: 'platform_url', label: '平台地址', param_type: 'url' },
    { name: 'username', label: '用户名', param_type: 'string' },
    { name: 'password', label: '登录密码', param_type: 'password', sensitive: true },
    {
      name: 'industry', label: '行业', param_type: 'string',
      required: false, description: '目标行业（如：银行、地产、医药），留空下载全部',
    },
    {
      name: 'date_range', label: '日期范围', param_type: 'string',
      default: '7d', description: '下载范围：7d/30d/90d（默认近 7 天）',
    },
    {
      name: 'archive_path', label: '归档路径', param_type: 'string',
      required: false, default: './archives/reports/',
    },
  ],
  tags: ['研报归档', '投研', '信息整合'],
  skill_steps: [
    {
      skill_name: 'login', description: '登录研报数据平台',
      param_mapping: { url: 'platform_url', username: 'username', password: 'password' },
    },
    {
      skill_name: 'search_and_select', description: '筛选目标行业研报',
      param_mapping: { search_text: 'industry', target_text: 'industry' },
    },
    {
      skill_name: 'pagination', description: '遍历多页研报列表',
      param_mapping: { max_pages: '=20' },
    },
    {
      skill_name: 'file_download', description: '下载研报并归档',
      param_mapping: { download_path: 'archive_path', trigger_text: '=下载' },
    },
  ],
};

export const SECURITIES_NAV_COLLECTION: WorkflowTemplate = {
  template_id: 'tpl_securities_nav',
  name: '基金净值数据采集',
  industry: 'securities',
  risk_level: 'low',
  description:
    '定时采集指定基金产品的最新净值数据（单位净值、累计净值、日涨跌幅），' +
    '写入数据库或导出文件。适用于资管产品监控和业绩比较。',
  navigation_target: '基金数据平台 - 基金净值查询',
  expected_result: '基金净值数据表（CSV），包含基金代码、名称、日期、单位净值、累计净值、涨跌幅',
  approval_rule: 'low 风险，无需审批',
  parameters: [
    { name: 'platform_url', label: '数据平台地址', param_type: 'url' },
    {
      name: 'username', label: '用户名', param_type: 'string',
      required: false, description: '平台账号（部分平台无需登录）',
    },
    {
      name: 'password', label: '登录密码', param_type: 'password',
      sensitive: true, required: false,
    },
    {
      name: 'fund_codes', label: '基金代码列表', param_type: 'string',
      description: '基金代码，多个以逗号分隔（如 000001,110011）',
    },
    { name: 'start_date', label: '开始日期', param_type: 'date', description: '净值查询起始日期' },
    { name: 'end_date', label: '结束日期', param_type: 'date', description: '净值查询截止日期' },
  ],
  tags: ['基金净值', '资管监控', '数据采集'],
  skill_steps: [
    {
      skill_name: 'login', description: '登录基金数据平台',
      param_mapping: { url: 'platform_url', username: 'username', password: 'password' },
    },
    {
      skill_name: 'form_fill', description: '填写基金代码和日期范围',
      param_mapping: {
        field_mapping: '={"基金代码": "${fund_codes}", "开始日期": "${start_date}", "结束日期": "${end_date}"}',
      },
    },
    {
      skill_name: 'table_extract', description: '提取净值数据',
      param_mapping: { output_format: '=csv' },
    },
  ],
};

// 模板注册表：template_id -> 模板
export const TEMPLATE_REGISTRY: Record<string, WorkflowTemplate> = {};
for (const t of [
  BANKING_STATEMENT_COLLECTION,
  BANKING_LOAN_REMINDER,
  INSURANCE_CLAIM_QUERY,
  INSURANCE_RENEWAL_CHECK,
  SECURITIES_REPORT_ARCHIVE,
  SECURITIES_NAV_COLLECTION,
]) {
  TEMPLATE_REGISTRY[t.template_id] = t;
}

/// 按行业过滤模板。未知行业返回空数组。
export function getTemplatesByIndustry(industry: string): WorkflowTemplate[] {
  return Object.values(TEMPLATE_REGISTRY).filter((t) => t.industry === industry);
}

/// 按 id 取模板，不存在返回 null。
export function getTemplate(templateId: string): WorkflowTemplate | null {
  return TEMPLATE_REGISTRY[templateId] ?? null;
}
