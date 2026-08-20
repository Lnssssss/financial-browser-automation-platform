import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserContext } from '../auth/permission.types';
import { getRoleInDepartment, isOrgAdmin } from '../auth/user-context.util';
import {
  ApprovalConflictError,
  ApprovalNotFoundError,
  ApprovalService,
} from './approval.service';

/// 决策入参。note 最长 2000
class DecisionDto {
  note?: string;
}

/// 判断用户是否有权审批目标部门的请求。
/// org_admin/super_admin 通吃；跨部门审批特权放行；否则需在目标部门是 approver 及以上。
function userCanApprove(user: UserContext, approverDeptId: string): boolean {
  if (isOrgAdmin(user)) return true;
  if (user.hasCrossOrgApprove) return true;
  const role = getRoleInDepartment(user, approverDeptId);
  return role !== null && ['approver', 'org_admin', 'super_admin'].includes(role);
}

@UseGuards(JwtAuthGuard)
@Controller('enterprise/approvals')
export class ApprovalController {
  constructor(private readonly approval: ApprovalService) {}

  /// 列出当前用户可处理的待审批请求。
  /// 过滤：同机构 + 用户在目标部门有审批权 + status=pending。
  @Get('pending')
  async listPending(@Request() req: { user: UserContext }) {
    const user = req.user;
    const records = await this.approval.listPendingByOrg(user.orgId);
    return records.filter((r) => userCanApprove(user, r.approverDepartmentId));
  }

  @Post(':id/approve')
  async approve(
    @Param('id') id: string,
    @Body() body: DecisionDto,
    @Request() req: { user: UserContext },
  ) {
    return this.decide(id, 'approved', body, req.user);
  }

  @Post(':id/reject')
  async reject(
    @Param('id') id: string,
    @Body() body: DecisionDto,
    @Request() req: { user: UserContext },
  ) {
    return this.decide(id, 'rejected', body, req.user);
  }

  /// approve/reject 的公共逻辑：先鉴权（同 org + 同部门审批权），再提交决策。
  private async decide(
    id: string,
    outcome: 'approved' | 'rejected',
    body: DecisionDto,
    user: UserContext,
  ) {
    const note = body?.note ?? '';
    if (note.length > 2000) {
      throw new BadRequestException('decision note too long (max 2000)');
    }

    // 先取记录做鉴权（跨 org / 无部门审批权直接 403，先于状态检查）
    const record = await this.approval.findById(id);
    if (!record) {
      throw new NotFoundException(`Approval request ${id} not found`);
    }
    if (record.organizationId !== user.orgId) {
      throw new ForbiddenException('Cannot act on requests from other organizations');
    }
    if (!userCanApprove(user, record.approverDepartmentId)) {
      throw new ForbiddenException('You are not authorized to act on requests for this department');
    }

    try {
      const updated = await this.approval.decide(id, outcome, user.userId, note);
      return {
        approval_id: updated.id,
        status: updated.status,
        decided_at: updated.decidedAt?.toISOString() ?? null,
        message: outcome === 'approved' ? 'Approval granted' : 'Approval rejected',
      };
    } catch (e) {
      // service 抛的领域异常转成对应 HTTP 状态
      if (e instanceof ApprovalNotFoundError) throw new NotFoundException(e.message);
      if (e instanceof ApprovalConflictError) throw new ConflictException(e.message);
      throw e;
    }
  }
}
