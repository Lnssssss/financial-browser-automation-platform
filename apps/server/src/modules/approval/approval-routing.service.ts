// 风险 → 审批路由映射。
//
// 纯映射函数：输入风险等级 + 来源部门，输出"要不要审批、谁审批、通知谁"。
// 风险越高，审批层级越高：high 在来源部门内消化，critical 上合规部并通知风险管理部。
// 未知等级保守当 high 处理（安全相关的不确定一律往严格倒）。

import { Injectable } from '@nestjs/common';
import { RiskLevel } from './risk-keywords';

/// 描述一次审批的路由结果：谁审批、通知谁。
export interface ApprovalRoute {
  requires_approval: boolean;
  approver_department_id: string | null;
  approver_role: string;
  notify_department_ids: string[];
  notify_roles: string[];
  description: string;
}

// 硬编码的知名部门 ID，需与数据库 seed 数据一致。
export const COMPLIANCE_DEPT_ID = 'dept_compliance';
export const RISK_MGMT_DEPT_ID = 'dept_risk_mgmt';

@Injectable()
export class ApprovalRoutingService {
  /// 按风险等级决定审批路由。
  route(riskLevel: RiskLevel | string, sourceDepartmentId: string): ApprovalRoute {
    if (riskLevel === 'low') {
      return {
        requires_approval: false,
        approver_department_id: null,
        approver_role: 'approver',
        notify_department_ids: [],
        notify_roles: [],
        description: 'Low risk — no approval required',
      };
    }

    if (riskLevel === 'medium') {
      return {
        requires_approval: false,
        approver_department_id: null,
        approver_role: 'approver',
        notify_department_ids: [],
        notify_roles: [],
        description: 'Medium risk — logged for audit, no approval required',
      };
    }

    if (riskLevel === 'high') {
      return {
        requires_approval: true,
        approver_department_id: sourceDepartmentId,
        approver_role: 'approver',
        notify_department_ids: [],
        notify_roles: [],
        description: `High risk — requires approver in department ${sourceDepartmentId}`,
      };
    }

    if (riskLevel === 'critical') {
      return {
        requires_approval: true,
        approver_department_id: COMPLIANCE_DEPT_ID,
        approver_role: 'approver',
        notify_department_ids: [RISK_MGMT_DEPT_ID],
        notify_roles: ['viewer'],
        description: 'Critical risk — requires compliance dept approver, risk dept notified',
      };
    }

    // 未知风险等级 —— 保守当 high 处理
    return {
      requires_approval: true,
      approver_department_id: sourceDepartmentId,
      approver_role: 'approver',
      notify_department_ids: [],
      notify_roles: [],
      description: `Unknown risk level '${riskLevel}' — treated as high risk`,
    };
  }
}
