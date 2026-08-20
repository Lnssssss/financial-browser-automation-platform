import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

// LLM 决策结果缓存。把「该点哪个元素、动作计划」这类 LLM 决策，按
// 「页面结构 DOM 哈希（剥掉动态内容）+ 导航目标哈希」做 key 缓存；命中则整个 LLM 调用直接跳过。
// 失效方式：TTL 过期（默认 24h）、管理 API 手动清、DOM 结构变化导致哈希不匹配（自然 miss）。


/// 缓存决策的默认存活时长（秒）。
export const DEFAULT_CACHE_TTL = 86400; // 24 小时

// ── DOM 哈希 ─────────────────────────────────────────────

// 被视为「动态」的模式，哈希前剥掉——保证同结构页面产出同哈希。
const DYNAMIC_PATTERNS: RegExp[] = [
  /\bid="[^"]*\d{6,}[^"]*"/g, // 含长数字的 id
  /\bdata-reactid="[^"]*"/g, // React 内部 id
  /\bdata-testid="[^"]*"/g, // 测试 id
  /\bstyle="[^"]*"/g, // 内联样式
  /\bclass="[^"]*"/g, // class 名（顺序易变）
  /<!--[\s\S]*?-->/g, // HTML 注释
  /\s+/g, // 折叠空白
];

const COMMENT_PATTERN = /<!--[\s\S]*?-->/g;

/// 剥掉 DOM 里的动态/非结构性内容。
function stripDynamicContent(domHtml: string): string {
  // 先去 HTML 注释
  let text = domHtml.replace(COMMENT_PATTERN, '');
  // 再去动态属性
  for (const pat of DYNAMIC_PATTERNS) {
    text = text.replace(pat, ' ');
  }
  // 所有空白归一为单空格并裁剪
  return text.replace(/\s+/g, ' ').trim();
}

/// 计算结构化 DOM 的稳定 SHA-256 哈希（64 位十六进制）。
export function computeDomHash(domHtml: string): string {
  const stripped = stripDynamicContent(domHtml);
  return createHash('sha256').update(stripped, 'utf8').digest('hex');
}

/// 导航目标文本的 MD5 哈希（32 位十六进制）。
export function computeGoalHash(navigationGoal: string): string {
  return createHash('md5').update(navigationGoal, 'utf8').digest('hex');
}

/// 拼装一条动作决策的缓存 key。org 前缀保证多租户隔离。
export function buildCacheKey(orgId: string, domHash: string, goalHash: string): string {
  return `action_cache:${orgId}:${domHash}:${goalHash}`;
}

// ── 缓存存储（生产环境换 Redis 实现） ──────────────────────

interface CacheEntry {
  value: Record<string, unknown>;
  expiresAt: number; // epoch 毫秒
}

export interface CacheStats {
  total_entries: number;
  hits: number;
  misses: number;
  hit_rate: number;
  sets: number;
}

/// 带 TTL 的内存动作缓存。接口刻意保持最小，生产可换 Redis 后端。
/// @Injectable：作为 DI 单例注入 controller，测试里可 new 独立实例，不再靠全局单例。
@Injectable()
export class ActionCacheStore {
  private store = new Map<string, CacheEntry>();
  private hits = 0;
  private misses = 0;
  private sets = 0;

  // ── 读 / 写 ─────────────────────────────────────────────

  /// 取缓存值；miss 或过期返回 null（过期时顺手删除）。
  get(key: string): Record<string, unknown> | null {
    const entry = this.store.get(key);
    if (entry === undefined) {
      this.misses += 1;
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.misses += 1;
      return null;
    }
    this.hits += 1;
    return entry.value;
  }

  /// 写入一个带 TTL（秒）的值。
  set(key: string, value: Record<string, unknown>, ttl: number = DEFAULT_CACHE_TTL): void {
    const expiresAt = Date.now() + ttl * 1000;
    this.store.set(key, { value, expiresAt });
    this.sets += 1;
  }

  // ── 管理 ─────────────────────────────────────────────

  /// 删单条，存在返回 true。
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /// 删所有以 prefix 开头的 key，返回删除条数。
  clearByPrefix(prefix: string): number {
    const keys = [...this.store.keys()].filter((k) => k.startsWith(prefix));
    for (const k of keys) this.store.delete(k);
    return keys.length;
  }

  /// 删所有已过期条目，返回删除条数。
  clearExpired(): number {
    const now = Date.now();
    const expired = [...this.store.entries()].filter(([, e]) => now > e.expiresAt).map(([k]) => k);
    for (const k of expired) this.store.delete(k);
    return expired.length;
  }

  /// 清空全部，返回删除条数。
  clearAll(): number {
    const count = this.store.size;
    this.store.clear();
    return count;
  }

  // ── 统计 ─────────────────────────────────────────────

  get stats(): CacheStats {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? Math.round((this.hits / total) * 1000) / 10 : 0.0;
    return {
      total_entries: this.store.size,
      hits: this.hits,
      misses: this.misses,
      hit_rate: hitRate,
      sets: this.sets,
    };
  }

  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.sets = 0;
  }

  // ── 高层辅助 ────────────

  /// 缓存一条 LLM 动作决策，返回缓存 key。
  cacheActionDecision(
    orgId: string,
    domHtml: string,
    navigationGoal: string,
    decision: Record<string, unknown>,
    ttl: number = DEFAULT_CACHE_TTL,
  ): string {
    const key = buildCacheKey(orgId, computeDomHash(domHtml), computeGoalHash(navigationGoal));
    this.set(key, decision, ttl);
    return key;
  }

  /// 查一条缓存决策，miss 返回 null。
  lookupCachedDecision(
    orgId: string,
    domHtml: string,
    navigationGoal: string,
  ): Record<string, unknown> | null {
    const key = buildCacheKey(orgId, computeDomHash(domHtml), computeGoalHash(navigationGoal));
    return this.get(key);
  }
}
