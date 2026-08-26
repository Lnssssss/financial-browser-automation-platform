// 多维租户上下文：用 Node 的 AsyncLocalStorage 存「当前请求可见范围」——
// 哪个组织、哪些部门、哪些业务线。由 tenant 中间件写入，查询过滤层读取。
//
// 等价说明：源用 Python ContextVar（随 async 请求生命周期隔离）。Node 的对应设施是
// AsyncLocalStorage——同样按异步调用链隔离，天然支持嵌套 run()。这里把 set/get/reset
// 的显式令牌语义，落到 ALS 的 run(store, callback) 作用域模型上。

import { AsyncLocalStorage } from 'node:async_hooks';

/// 当前用户数据可见范围的不可变快照。
/// 用 class + 只读字段 + 冻结实例，对齐源 @dataclass(frozen=True) 的不可变语义。
export class TenantContext {
  readonly orgId: string;
  readonly userId: string;
  readonly visibleDepartmentIds: string[];
  readonly visibleBusinessLineIds: string[];
  readonly hasFullOrgVisibility: boolean;

  constructor(params: {
    orgId: string;
    userId: string;
    visibleDepartmentIds?: string[];
    visibleBusinessLineIds?: string[];
    hasFullOrgVisibility?: boolean;
  }) {
    this.orgId = params.orgId;
    this.userId = params.userId;
    this.visibleDepartmentIds = params.visibleDepartmentIds ?? [];
    this.visibleBusinessLineIds = params.visibleBusinessLineIds ?? [];
    this.hasFullOrgVisibility = params.hasFullOrgVisibility ?? false;
    Object.freeze(this); // frozen：设值抛错，对齐源不可变
  }

  /// 受限即「没有全组织可见权」——数据访问被限制在特定部门/业务线。
  get isRestricted(): boolean {
    return !this.hasFullOrgVisibility;
  }
}

// 模块级 ALS——一份存储，按异步请求链隔离。对齐源模块级 ContextVar 单例。
const storage = new AsyncLocalStorage<TenantContext>();

/// 在给定上下文作用域内运行回调。作用域结束自动还原——
/// 对齐源 set → try/finally reset 的成对语义，且天然支持嵌套（子请求）。
export function runWithTenantContext<T>(ctx: TenantContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/// 取当前请求的租户上下文，未设置返回 null。
export function getTenantContext(): TenantContext | null {
  return storage.getStore() ?? null;
}

/// 取当前租户上下文，未设置抛错。
/// 用在「必须跑在通过了租户中间件的请求内」的代码路径。
export function requireTenantContext(): TenantContext {
  const ctx = storage.getStore();
  if (ctx == null) {
    throw new Error(
      'Tenant context not available. ' +
        'This code must run within a request that passed tenant middleware.',
    );
  }
  return ctx;
}
