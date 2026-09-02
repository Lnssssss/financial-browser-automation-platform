// Demo 演示数据生成器（纯函数，无 DI、无副作用、可测）。
//
// 让 Dashboard/审批中心/审计时间线一打开就有真实感的数据。
// 这里 1:1 对齐分布与语义，不扩表、不改统计逻辑。
//
// 生成器接收一个OrgContext（已解析的真实 id），据此生成——保证 dashboard 按 orgId、审批/审计按
// organizationId 过滤时数据可见。

import type { TaskRecord, ModelCallRecord } from '../dashboard/dashboard.types';

// ---------------------------------------------------------------------------
// 确定性伪随机
// ---------------------------------------------------------------------------

/// mulberry32：最小可 seed 的 PRNG。固定种子 → 每次生成完全一致（幂等 + 可测）。
/// 不用 Math.random：需要确定性以保证多次 boot 灌出的库数据一致、单测可断言分布。
export class SeededRng {
  private state: number;

  constructor(seed = 42) {
    this.state = seed >>> 0;
  }

  /// [0, 1) 均匀分布。
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /// [lo, hi] 闭区间整数。
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  /// 数组等概率取一。
  choice<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /// 按权重取一（weights 与 items 等长）。
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      roll -= weights[i];
      if (roll < 0) return items[i];
    }
    return items[items.length - 1];
  }

  /// 指数分布（源用 rng.expovariate(lambda)）。
  expovariate(lambda: number): number {
    // -ln(1-U)/lambda；U∈[0,1) 故 1-U∈(0,1]，log 安全。
    return -Math.log(1 - this.next()) / lambda;
  }

  /// 从数组不放回抽样 k 个。
  sample<T>(arr: readonly T[], k: number): T[] {
    const pool = [...arr];
    const out: T[] = [];
    const n = Math.min(k, pool.length);
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(this.next() * pool.length);
      out.push(pool.splice(idx, 1)[0]);
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// 常量表（迁自 demo_seed.py，措辞照搬；结构按目标组织架构调整）
// ---------------------------------------------------------------------------

/// 银行任务模板（按业务线）。源有 4 业务线，目标现有 2 条（CORP_LOAN / INTL_SETTLE），
/// 其余模板归并到这两条下，保持中文措辞不变。
export const TASK_TEMPLATES: Record<string, string[]> = {
  CORP_LOAN: [
    '企业贷款申请材料审核',
    '贷款额度计算与风险评估',
    '企业信用报告查询',
    '贷后监控数据采集',
    '抵押物价值评估录入',
    '贷款合同条款自动化审查',
    '企业财务报表数据提取',
    '个人征信报告查询',
    '零售贷款利率计算',
    '消费贷款自动化审批',
  ],
  INTL_SETTLE: [
    '跨境汇款合规审查',
    '国际结算单据核验',
    '外汇交易数据录入',
    '贸易融资申请处理',
    '进出口报关信息采集',
    '基金产品净值更新',
    '客户资产配置方案生成',
    '投资组合风险分析',
  ],
};

/// 错误类型 + 相对权重。
export const ERROR_TYPES: [string, number][] = [
  ['ELEMENT_NOT_FOUND', 30],
  ['TIMEOUT', 25],
  ['LLM_FAILURE', 20],
  ['PAGE_LOAD_ERROR', 10],
  ['NAVIGATION_ERROR', 8],
  ['CAPTCHA_BLOCKED', 5],
  ['SESSION_EXPIRED', 2],
];

export const ACTION_TYPES = [
  'NAVIGATE', 'CLICK', 'INPUT_TEXT', 'SELECT_OPTION',
  'WAIT', 'SCREENSHOT', 'SCROLL', 'EXTRACT_DATA',
] as const;

export const RISK_REASONS: Record<'high' | 'critical', string[]> = {
  high: [
    '大额交易操作，金额超过100万元',
    '敏感客户信息批量导出',
    '贷款额度调整超过审批权限',
    '跨境交易金额异常',
    '关联交易检测触发',
  ],
  critical: [
    '系统权限变更操作',
    '核心数据库批量修改',
    '超大额资金划转（超过1000万）',
    '监管报送数据修改',
    '客户隐私数据大规模访问',
  ],
};

export const PAGE_URLS = [
  'https://core-banking.demo.bank/loans/application',
  'https://core-banking.demo.bank/credit/assessment',
  'https://core-banking.demo.bank/customer/kyc',
  'https://core-banking.demo.bank/settlement/international',
  'https://core-banking.demo.bank/wealth/portfolio',
  'https://core-banking.demo.bank/risk/monitoring',
  'https://core-banking.demo.bank/compliance/reports',
  'https://core-banking.demo.bank/forex/transactions',
];

export const DECISION_NOTES_APPROVE = [
  '审核通过', '已核实，同意执行', '风险可控，批准', '材料完整，通过', '合规检查无异常',
];
export const DECISION_NOTES_REJECT = [
  '材料不完整，请补充', '风险评估未通过', '超出审批权限', '需要额外审查', '操作目标存疑，拒绝',
];

const CLICK_TARGETS = [
  'button#submit', 'a.nav-link', 'input[type=submit]',
  'div.menu-item', 'span.action-btn', 'button.confirm',
];
const INPUT_TARGETS = [
  'input#loan-amount', 'input#customer-id', 'textarea#remarks',
  'input#search', 'input#account-number',
];
const SELECT_TARGETS = ['select#risk-level', 'select#department', 'select#currency'];

// ---------------------------------------------------------------------------
// 组织上下文
// ---------------------------------------------------------------------------

/// 一个可派任务的部门单元（真实 dept.id + 它挂的业务线 + 该部门可用的 operator/approver）。
export interface DeptUnit {
  departmentId: string;
  businessLineIds: string[];
  operatorUserIds: string[];
  approverUserId: string | null;
}

/// 生成器需要的全部真实 id（由 DemoSeedService 从库查出后组装）。
export interface OrgContext {
  orgId: string;
  /// 可派任务的运营部门 + 权重（对齐源 dept_weights 0.40/0.25/0.20/0.15）。
  operationalUnits: DeptUnit[];
  unitWeights: number[];
  /// critical 审批的兜底审批部门（合规部）。
  complianceDeptId: string;
  complianceApproverUserId: string;
  /// 国际结算业务线的真实 id（用于挑 INTL_SETTLE 任务模板；其余业务线走 CORP_LOAN 模板）。
  intlSettleBusinessLineId: string | null;
}

// ---------------------------------------------------------------------------
// 生成器
// ---------------------------------------------------------------------------

/// 生成的任务（TaskRecord 供 dashboard 内存；附加字段供 approval/audit 关联）。
export interface DemoTask extends TaskRecord {
  task_id: string;
  organization_id: string;
  department_id: string;
  business_line_id: string;
  created_by: string;
  task_name: string;
}

const TASK_STATUSES = {
  completed: 'completed',
  failed: 'failed',
  running: 'running',
  needs_human: 'needs_human',
  pending_approval: 'pending_approval',
} as const;

/// 生成任务，分布对齐 _generate_tasks。now 由调用方传入（避免脚本内取 Date.now 的不确定性）。
export function generateTasks(
  rng: SeededRng,
  now: Date,
  ctx: OrgContext,
  count = 250,
): DemoTask[] {
  const errorNames = ERROR_TYPES.map((e) => e[0]);
  const errorWeights = ERROR_TYPES.map((e) => e[1]);
  const tasks: DemoTask[] = [];

  for (let i = 0; i < count; i++) {
    const unit = rng.weighted(ctx.operationalUnits, ctx.unitWeights);
    const blId = rng.choice(unit.businessLineIds);
    const creator = rng.choice(unit.operatorUserIds);
    const templates = TASK_TEMPLATES[blCodeKey(blId, ctx)] ?? TASK_TEMPLATES.CORP_LOAN;
    const taskName = rng.choice(templates);

    // 指数分布：越近的任务越多（源 rng.expovariate(0.15)，上限 30 天）。
    const daysAgo = Math.min(Math.floor(rng.expovariate(0.15)), 30);
    let createdAt = new Date(now.getTime() - daysAgo * 86400_000 - rng.int(0, 6) * 3600_000);
    createdAt = withClock(createdAt, rng.int(8, 18), rng.int(0, 59), rng.int(0, 59));

    // 状态分布：72% completed / 15% failed / 5% running / 5% needs_human / 3% pending_approval。
    const roll = rng.next();
    let status: string;
    if (roll < 0.72) status = TASK_STATUSES.completed;
    else if (roll < 0.87) status = TASK_STATUSES.failed;
    else if (roll < 0.92) status = TASK_STATUSES.running;
    else if (roll < 0.97) status = TASK_STATUSES.needs_human;
    else status = TASK_STATUSES.pending_approval;

    if (status === TASK_STATUSES.running) {
      createdAt = new Date(now.getTime() - rng.int(0, 3) * 3600_000 - rng.int(0, 59) * 60_000);
    }

    let durationMs: number | undefined;
    if (status === TASK_STATUSES.completed) durationMs = rng.int(30000, 900000);
    else if (status === TASK_STATUSES.failed) durationMs = rng.int(10000, 300000);
    else if (status === TASK_STATUSES.running) durationMs = undefined;
    else durationMs = rng.int(20000, 600000);

    let errorType: string | undefined;
    if (status === TASK_STATUSES.failed) {
      errorType = rng.weighted(errorNames, errorWeights);
    }

    tasks.push({
      task_id: `tsk_demo_${String(i + 1).padStart(4, '0')}`,
      org_id: ctx.orgId,
      organization_id: ctx.orgId,
      department_id: unit.departmentId,
      business_line_id: blId,
      status,
      created_at: toIso(createdAt),
      duration_ms: durationMs,
      error_type: errorType,
      created_by: creator,
      task_name: taskName,
    });
  }

  tasks.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return tasks;
}

/// 一条要落库的审批记录（字段对齐 Prisma ApprovalRecord + dashboard stats 双写）。
export interface DemoApproval {
  approval_id: string;
  task_id: string;
  organization_id: string;
  department_id: string;
  business_line_id: string;
  risk_level: 'high' | 'critical';
  risk_reason: string;
  operation_description: string;
  approver_department_id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requested_at: string;
  timeout_seconds: number;
  approver_user_id: string | null;
  decided_at: string | null;
  decision_note: string | null;
}

/// 生成审批（对齐 _generate_approvals）。
export function generateApprovals(rng: SeededRng, tasks: DemoTask[], ctx: OrgContext): DemoApproval[] {
  const approvals: DemoApproval[] = [];
  let idx = 0;

  const unitByDept = new Map(ctx.operationalUnits.map((u) => [u.departmentId, u]));

  const add = (
    task: DemoTask,
    riskLevel: 'high' | 'critical',
    finalStatus: 'PENDING' | 'APPROVED' | 'REJECTED',
    responseMin: number | null,
  ) => {
    idx += 1;
    const deptId = task.department_id;
    // critical 或 20% 概率上合规部；否则本部门审批。
    const approverDept =
      riskLevel === 'critical' || rng.next() < 0.2 ? ctx.complianceDeptId : deptId;
    const requestedAt = task.created_at;

    let decidedAt: string | null = null;
    let approverUser: string | null = null;
    let note: string | null = null;
    if (finalStatus !== 'PENDING' && responseMin !== null) {
      const reqMs = new Date(requestedAt).getTime();
      decidedAt = toIso(new Date(reqMs + responseMin * 60_000));
      approverUser =
        approverDept === ctx.complianceDeptId
          ? ctx.complianceApproverUserId
          : unitByDept.get(approverDept)?.approverUserId ?? ctx.complianceApproverUserId;
      note =
        finalStatus === 'APPROVED'
          ? rng.choice(DECISION_NOTES_APPROVE)
          : rng.choice(DECISION_NOTES_REJECT);
    }

    approvals.push({
      approval_id: `apr_demo_${String(idx).padStart(4, '0')}`,
      task_id: task.task_id,
      organization_id: ctx.orgId,
      department_id: deptId,
      business_line_id: task.business_line_id,
      risk_level: riskLevel,
      risk_reason: rng.choice(RISK_REASONS[riskLevel]),
      operation_description: task.task_name,
      approver_department_id: approverDept,
      status: finalStatus,
      requested_at: requestedAt,
      timeout_seconds: riskLevel === 'high' ? 3600 : 1800,
      approver_user_id: approverUser,
      decided_at: decidedAt,
      decision_note: note,
    });
  };

  // pending_approval 任务 → PENDING。
  for (const t of tasks.filter((t) => t.status === 'pending_approval')) {
    add(t, rng.choice(['high', 'critical'] as const), 'PENDING', null);
  }
  // ~40 completed → APPROVED。
  const completed = tasks.filter((t) => t.status === 'completed');
  for (const t of rng.sample(completed, Math.min(40, completed.length))) {
    add(t, rng.choice(['high', 'high', 'critical'] as const), 'APPROVED', rng.int(5, 90));
  }
  // ~8 failed → REJECTED。
  const failed = tasks.filter((t) => t.status === 'failed');
  for (const t of rng.sample(failed, Math.min(8, failed.length))) {
    add(t, rng.choice(['high', 'critical'] as const), 'REJECTED', rng.int(3, 60));
  }

  return approvals;
}

/// 一条要落库的审计日志（字段对齐 Prisma AuditLog）。
export interface DemoAuditLog {
  audit_log_id: string;
  task_id: string;
  organization_id: string;
  department_id: string;
  business_line_id: string;
  action_index: number;
  action_type: string;
  target_element: string | null;
  input_value: string | null;
  page_url: string;
  duration_ms: number;
  executor: string;
  execution_result: string;
  error_message: string | null;
  has_approval: boolean;
  approval_id: string | null;
  approver_user_id: string | null;
  created_at: string;
}

/// 生成审计日志（对齐 _generate_audit_logs：最近 120 任务，每任务 3-12 action）。
export function generateAuditLogs(
  rng: SeededRng,
  tasks: DemoTask[],
  approvals: DemoApproval[],
  ctx: OrgContext,
): DemoAuditLog[] {
  const logs: DemoAuditLog[] = [];
  let logIdx = 0;

  // task_id → 首个审批（供把某个 action 标成审批点）。
  const taskApproval = new Map<string, DemoApproval>();
  for (const apr of approvals) {
    if (!taskApproval.has(apr.task_id)) taskApproval.set(apr.task_id, apr);
  }

  const loggable = tasks
    .filter((t) => ['completed', 'failed', 'needs_human', 'pending_approval'].includes(t.status))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 120);

  for (const task of loggable) {
    const numActions = rng.int(3, 12);
    const taskCreated = new Date(task.created_at).getTime();
    const approval = taskApproval.get(task.task_id) ?? null;
    const hasApproval = approval !== null;
    const approvalActionIdx = hasApproval ? rng.int(2, Math.max(2, numActions - 1)) : -1;

    for (let actionIdx = 0; actionIdx < numActions; actionIdx++) {
      logIdx += 1;
      let offsetS = 0;
      for (let k = 0; k < actionIdx; k++) offsetS += rng.int(2, 30);
      const actionTime = new Date(taskCreated + offsetS * 1000);

      let actionType: string;
      if (actionIdx === 0) actionType = 'NAVIGATE';
      else if (actionIdx === numActions - 1 && task.status === 'completed') actionType = 'EXTRACT_DATA';
      else actionType = rng.choice(ACTION_TYPES);

      let execResult: string;
      let errorMsg: string | null;
      if (task.status === 'failed' && actionIdx === numActions - 1) {
        execResult = 'failed';
        errorMsg = task.error_type ?? 'UNKNOWN';
      } else if (rng.next() < 0.03) {
        execResult = 'failed';
        errorMsg = rng.choice(['Element not interactable', 'Timeout waiting for element', 'Navigation failed']);
      } else {
        execResult = 'success';
        errorMsg = null;
      }

      let target: string | null = null;
      let inputVal: string | null = null;
      if (actionType === 'CLICK') target = rng.choice(CLICK_TARGETS);
      else if (actionType === 'INPUT_TEXT') {
        target = rng.choice(INPUT_TARGETS);
        inputVal = '***'; // 脱敏
      } else if (actionType === 'SELECT_OPTION') target = rng.choice(SELECT_TARGETS);

      const isApprovalAction = hasApproval && actionIdx === approvalActionIdx;
      logs.push({
        audit_log_id: `aud_demo_${String(logIdx).padStart(6, '0')}`,
        task_id: task.task_id,
        organization_id: ctx.orgId,
        department_id: task.department_id,
        business_line_id: task.business_line_id,
        action_index: actionIdx,
        action_type: actionType,
        target_element: target,
        input_value: inputVal,
        page_url: rng.choice(PAGE_URLS),
        duration_ms: rng.int(100, 15000),
        executor: 'agent',
        execution_result: execResult,
        error_message: errorMsg,
        has_approval: isApprovalAction,
        approval_id: isApprovalAction ? approval!.approval_id : null,
        approver_user_id: isApprovalAction ? approval!.approver_user_id : null,
        created_at: toIso(actionTime),
      });
    }
  }

  return logs;
}

/// 生成 LLM 调用记录（对齐 _generate_model_calls：三 tier 权重 50/35/15）。
export function generateModelCalls(rng: SeededRng, tasks: DemoTask[], count = 1200): ModelCallRecord[] {
  const tiers = ['light', 'standard', 'heavy'] as const;
  const tierWeights = [0.5, 0.35, 0.15];
  const tokenRanges: Record<string, [number, number]> = {
    light: [200, 2000],
    standard: [1000, 8000],
    heavy: [5000, 32000],
  };
  const cacheRates: Record<string, number> = { light: 0.45, standard: 0.3, heavy: 0.15 };

  const calls: ModelCallRecord[] = [];
  for (let i = 0; i < count; i++) {
    const tier = rng.weighted(tiers, tierWeights);
    const [lo, hi] = tokenRanges[tier];
    const task = rng.choice(tasks);
    calls.push({
      org_id: task.org_id,
      model_tier: tier,
      tokens: rng.int(lo, hi),
      cache_hit: rng.next() < cacheRates[tier],
    });
  }
  return calls;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/// 业务线 id → TASK_TEMPLATES 的 key。ctx 里带 businessLineId→code 的对应由调用方保证：
/// 这里用一个约定——ctx.operationalUnits 里 INTL 结算业务线走 INTL_SETTLE 模板，其余走 CORP_LOAN。
function blCodeKey(blId: string, ctx: OrgContext): string {
  return ctx.intlSettleBusinessLineId && blId === ctx.intlSettleBusinessLineId
    ? 'INTL_SETTLE'
    : 'CORP_LOAN';
}

/// ISO 8601 无时区后缀（UTC 语义），对齐 dashboard.types 的 created_at 约定。
function toIso(d: Date): string {
  return d.toISOString().replace('Z', '');
}

/// 设置时钟部分，保留日期。
function withClock(d: Date, h: number, m: number, s: number): Date {
  const copy = new Date(d);
  copy.setUTCHours(h, m, s, 0);
  return copy;
}
