// 基于租户上下文的自动查询过滤：把「当前可见范围」翻译成 Prisma 的 where 条件。
// - 全组织可见：只按 org 过滤
// - 受限：org AND (可见部门 OR 可见业务线)
// - 受限且无任何可见部门/业务线：造一个永假条件 → 查不到任何数据
//
// 等价说明：源在 SQLAlchemy Query 上链式 .filter 追加 WHERE。Prisma 无查询事件钩子，
// 故做成纯函数 buildTenantWhere(ctx) → where 对象，由调用方合并进 findMany({ where })。
// 纯函数天然可测（对齐源把核心逻辑抽成 apply_tenant_filter 便于测试的意图）。

import type { Prisma } from '@prisma/client';
import type { TenantContext } from './tenant-context';
import { getTenantContext } from './tenant-context';

/// 永远查不到数据的哨兵组织 id——受限用户既无可见部门也无可见业务线时用它，
/// 对齐源 `organization_id == "__no_access__"` 的不可能条件。
export const NO_ACCESS_ORG_ID = '__no_access__';

/// 由租户上下文构造 TaskExtension 的 where 条件。
/// 传入 ctx=null（无上下文）返回空对象 {} —— 不追加任何过滤，对齐源「无上下文原样返回」。
export function buildTenantWhere(
  ctx: TenantContext | null,
): Prisma.TaskExtensionWhereInput {
  if (ctx == null) {
    return {};
  }

  // 全组织可见：只按 org 收敛
  if (ctx.hasFullOrgVisibility) {
    return { organizationId: ctx.orgId };
  }

  // 受限：先锁 org，再按 (可见部门 OR 可见业务线) 收敛
  const conditions: Prisma.TaskExtensionWhereInput[] = [];
  if (ctx.visibleDepartmentIds.length > 0) {
    conditions.push({ departmentId: { in: ctx.visibleDepartmentIds } });
  }
  if (ctx.visibleBusinessLineIds.length > 0) {
    conditions.push({ businessLineId: { in: ctx.visibleBusinessLineIds } });
  }

  if (conditions.length === 0) {
    // 无任何可见维度 → 永假条件，什么都查不到
    return { organizationId: NO_ACCESS_ORG_ID };
  }

  return { organizationId: ctx.orgId, OR: conditions };
}

/// 便捷函数：从当前请求上下文（ALS）取 ctx 再构造 where。
export function tenantWhereFromContext(): Prisma.TaskExtensionWhereInput {
  return buildTenantWhere(getTenantContext());
}
