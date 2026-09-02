import { describe, it, expect, beforeEach } from 'vitest';
import { PermissionService } from './permission.service';
import { PermissionLevel, UserContext } from './permission.types';

// 作为 auth 模块的行为对齐基准：这 24 个用例全绿 = TS 版行为与 Python 版一致。

const ORG = 'o_demo_cmb';
const DEPT_CORP_CREDIT = 'dept_corp_credit';
const DEPT_PERSONAL_FIN = 'dept_personal_fin';
const DEPT_ASSET_MGMT = 'dept_asset_mgmt';
const DEPT_RISK_MGMT = 'dept_risk_mgmt';
const DEPT_COMPLIANCE = 'dept_compliance';
const DEPT_IT = 'dept_it';
const BL_CORP_LOAN = 'bl_corp_loan';
const BL_RETAIL_CREDIT = 'bl_retail_credit';
const BL_INTL_SETTLE = 'bl_intl_settle';

function makeUser(
  userId: string,
  deptRoles: [string, string, string][],
  blIds: string[],
  crossRead = false,
  crossApprove = false,
): UserContext {
  return {
    userId,
    orgId: ORG,
    departmentRoles: deptRoles.map(([departmentId, departmentName, role]) => ({
      departmentId,
      departmentName,
      role,
    })),
    businessLineIds: blIds,
    hasCrossOrgRead: crossRead,
    hasCrossOrgApprove: crossApprove,
  };
}

describe('PermissionService.resolve', () => {
  let svc: PermissionService;
  beforeEach(() => {
    svc = new PermissionService();
  });

  // 场景 1：普通操作员（对公信贷 + 对公贷款业务线）
  describe('普通操作员', () => {
    const operator = () =>
      makeUser('eu_cc_op1', [[DEPT_CORP_CREDIT, '对公信贷部', 'operator']], [BL_CORP_LOAN]);

    it('本部门 + 本业务线 → OPERATE', () => {
      expect(svc.resolve(operator(), ORG, DEPT_CORP_CREDIT, BL_CORP_LOAN)).toBe(PermissionLevel.OPERATE);
    });
    it('本部门无业务线 → 仍按部门角色 OPERATE', () => {
      expect(svc.resolve(operator(), ORG, DEPT_CORP_CREDIT, null)).toBe(PermissionLevel.OPERATE);
    });
    it('其他部门 → NONE', () => {
      expect(svc.resolve(operator(), ORG, DEPT_PERSONAL_FIN, BL_RETAIL_CREDIT)).toBe(PermissionLevel.NONE);
    });
    it('本业务线但别的部门 → 经业务线仍 OPERATE', () => {
      expect(svc.resolve(operator(), ORG, DEPT_PERSONAL_FIN, BL_CORP_LOAN)).toBe(PermissionLevel.OPERATE);
    });
    it('跨组织 → NONE', () => {
      expect(svc.resolve(operator(), 'other_org', DEPT_CORP_CREDIT, BL_CORP_LOAN)).toBe(PermissionLevel.NONE);
    });
  });

  // 场景 2：跨业务线操作员
  describe('跨业务线操作员', () => {
    const crossOp = () =>
      makeUser('eu_cc_cross', [[DEPT_CORP_CREDIT, '对公信贷部', 'operator']], [BL_CORP_LOAN, BL_INTL_SETTLE]);

    it('第一条业务线可达', () => {
      expect(svc.resolve(crossOp(), ORG, DEPT_CORP_CREDIT, BL_CORP_LOAN)).toBe(PermissionLevel.OPERATE);
    });
    it('第二条业务线可达', () => {
      expect(svc.resolve(crossOp(), ORG, DEPT_CORP_CREDIT, BL_INTL_SETTLE)).toBe(PermissionLevel.OPERATE);
    });
    it('别的部门但在业务线内 → 可达', () => {
      expect(svc.resolve(crossOp(), ORG, DEPT_ASSET_MGMT, BL_INTL_SETTLE)).toBe(PermissionLevel.OPERATE);
    });
    it('无关业务线 → NONE', () => {
      expect(svc.resolve(crossOp(), ORG, DEPT_PERSONAL_FIN, BL_RETAIL_CREDIT)).toBe(PermissionLevel.NONE);
    });
  });

  // 场景 3：部门审批员
  describe('部门审批员', () => {
    const approver = () =>
      makeUser('eu_cc_approver', [[DEPT_CORP_CREDIT, '对公信贷部', 'approver']], [BL_CORP_LOAN]);

    it('本部门 → APPROVE', () => {
      expect(svc.resolve(approver(), ORG, DEPT_CORP_CREDIT, BL_CORP_LOAN)).toBe(PermissionLevel.APPROVE);
    });
    it('其他部门 → NONE', () => {
      expect(svc.resolve(approver(), ORG, DEPT_PERSONAL_FIN, BL_RETAIL_CREDIT)).toBe(PermissionLevel.NONE);
    });
  });

  // 场景 4：风控只读（cross_org_read）
  describe('风控只读', () => {
    const riskViewer = () =>
      makeUser('eu_risk_viewer1', [[DEPT_RISK_MGMT, '风险管理部', 'viewer']], [], true);

    it('本部门 → READ', () => {
      expect(svc.resolve(riskViewer(), ORG, DEPT_RISK_MGMT, null)).toBe(PermissionLevel.READ);
    });
    it('其他部门 → 跨组织只读 READ', () => {
      expect(svc.resolve(riskViewer(), ORG, DEPT_CORP_CREDIT, BL_CORP_LOAN)).toBe(PermissionLevel.READ);
    });
    it('不能 OPERATE', () => {
      expect(svc.resolve(riskViewer(), ORG, DEPT_CORP_CREDIT, BL_CORP_LOAN)).not.toBe(PermissionLevel.OPERATE);
    });
    it('不能 APPROVE', () => {
      expect(svc.resolve(riskViewer(), ORG, DEPT_CORP_CREDIT, BL_CORP_LOAN)).not.toBe(PermissionLevel.APPROVE);
    });
  });

  // 场景 5：合规审批（cross_org_read + approve）
  describe('合规审批', () => {
    const compApprover = () =>
      makeUser('eu_comp_approver', [[DEPT_COMPLIANCE, '合规审计部', 'approver']], [], true, true);

    it('本部门 → APPROVE', () => {
      expect(svc.resolve(compApprover(), ORG, DEPT_COMPLIANCE, null)).toBe(PermissionLevel.APPROVE);
    });
    it('其他部门 → 跨组织审批 APPROVE', () => {
      expect(svc.resolve(compApprover(), ORG, DEPT_CORP_CREDIT, BL_CORP_LOAN)).toBe(PermissionLevel.APPROVE);
    });
    it('任意业务线 → APPROVE', () => {
      expect(svc.resolve(compApprover(), ORG, DEPT_PERSONAL_FIN, BL_RETAIL_CREDIT)).toBe(PermissionLevel.APPROVE);
    });
  });

  // 场景 6：超管
  describe('超管', () => {
    const admin = () => makeUser('eu_admin', [[DEPT_IT, '信息技术部', 'super_admin']], []);

    it('本部门 → 全权 APPROVE', () => {
      expect(svc.resolve(admin(), ORG, DEPT_IT, null)).toBe(PermissionLevel.APPROVE);
    });
    it('任意部门 → 全权 APPROVE', () => {
      expect(svc.resolve(admin(), ORG, DEPT_CORP_CREDIT, BL_CORP_LOAN)).toBe(PermissionLevel.APPROVE);
    });
    it('任意业务线 → 全权 APPROVE', () => {
      expect(svc.resolve(admin(), ORG, DEPT_PERSONAL_FIN, BL_RETAIL_CREDIT)).toBe(PermissionLevel.APPROVE);
    });
    it('跨组织 → NONE', () => {
      expect(svc.resolve(admin(), 'other_org', DEPT_CORP_CREDIT, BL_CORP_LOAN)).toBe(PermissionLevel.NONE);
    });
  });

  // 边界
  describe('边界情况', () => {
    it('viewer 只读', () => {
      const viewer = makeUser('eu_cc_viewer', [[DEPT_CORP_CREDIT, '对公信贷部', 'viewer']], [BL_CORP_LOAN]);
      expect(svc.resolve(viewer, ORG, DEPT_CORP_CREDIT, BL_CORP_LOAN)).toBe(PermissionLevel.READ);
    });
    it('无任何角色 → NONE', () => {
      const empty = makeUser('eu_empty', [], []);
      expect(svc.resolve(empty, ORG, DEPT_CORP_CREDIT, BL_CORP_LOAN)).toBe(PermissionLevel.NONE);
    });
    it('权限解析不查 is_active（那是登录层的事）', () => {
      const user = makeUser('eu_inactive', [[DEPT_PERSONAL_FIN, '个人金融部', 'operator']], [BL_RETAIL_CREDIT]);
      expect(svc.resolve(user, ORG, DEPT_PERSONAL_FIN, BL_RETAIL_CREDIT)).toBe(PermissionLevel.OPERATE);
    });
    it('合规 viewer：只有 cross_org_read 不含 approve → READ', () => {
      const compViewer = makeUser('eu_comp_viewer', [[DEPT_COMPLIANCE, '合规审计部', 'viewer']], [], true, false);
      expect(svc.resolve(compViewer, ORG, DEPT_CORP_CREDIT, BL_CORP_LOAN)).toBe(PermissionLevel.READ);
    });
  });
});
