import type { ApprovalRequest } from '@/api/enterprise';

export function demoApprovals(): ApprovalRequest[] {
  return [
    {
      id: 'apr_001',
      taskId: 'tsk_demo_0245',
      riskLevel: 'high',
      riskReason: '大额交易操作，金额超过100万元',
      operationDescription: '企业贷款申请材料审核',
      departmentId: 'dept_corp_credit',
      businessLineId: 'bl_corp_loan',
      requestedAt: '2026-03-07T10:30:00',
      status: 'pending',
    },
    {
      id: 'apr_002',
      taskId: 'tsk_demo_0248',
      riskLevel: 'critical',
      riskReason: '核心数据库批量修改',
      operationDescription: '客户KYC信息更新',
      departmentId: 'dept_personal_fin',
      businessLineId: 'bl_retail_credit',
      requestedAt: '2026-03-07T09:15:00',
      status: 'pending',
    },
    {
      id: 'apr_003',
      taskId: 'tsk_demo_0250',
      riskLevel: 'high',
      riskReason: '跨境交易金额异常',
      operationDescription: '跨境汇款合规审查',
      departmentId: 'dept_corp_credit',
      businessLineId: 'bl_intl_settle',
      requestedAt: '2026-03-07T08:45:00',
      status: 'pending',
    },
  ];
}
