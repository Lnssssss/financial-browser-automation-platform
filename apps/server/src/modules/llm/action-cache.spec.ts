import { describe, it, expect, beforeEach } from 'vitest';
import { ActionCacheStore, computeDomHash, computeGoalHash, buildCacheKey, DEFAULT_CACHE_TTL } from './action-cache.service';


describe('computeDomHash', () => {
  it('same structure yields same hash', () => {
    const dom1 = '<div class="container"><button id="submit">Submit</button></div>';
    const dom2 = '<div class="container"><button id="submit">Submit</button></div>';
    expect(computeDomHash(dom1)).toBe(computeDomHash(dom2));
  });

  it('strips dynamic ids', () => {
    const dom1 = '<button id="btn_123456">Click</button>';
    const dom2 = '<button id="btn_789012">Click</button>';
    // 同样的结构（都有 button 包 "Click"），动态 id 被剥掉
    expect(computeDomHash(dom1)).toBe(computeDomHash(dom2));
  });

  it('strips inline style', () => {
    const dom1 = '<div style="color: red;">Content</div>';
    const dom2 = '<div style="color: blue;">Content</div>';
    expect(computeDomHash(dom1)).toBe(computeDomHash(dom2));
  });

  it('strips class attribute', () => {
    const dom1 = '<div class="a b c">Text</div>';
    const dom2 = '<div class="c a b">Text</div>';
    expect(computeDomHash(dom1)).toBe(computeDomHash(dom2));
  });

  it('strips HTML comments', () => {
    const dom1 = '<!-- Comment A --><div>Text</div>';
    const dom2 = '<!-- Comment B --><div>Text</div>';
    expect(computeDomHash(dom1)).toBe(computeDomHash(dom2));
  });

  it('different structure yields different hash', () => {
    const dom1 = '<div><button>A</button></div>';
    const dom2 = '<div><input /></div>';
    expect(computeDomHash(dom1)).not.toBe(computeDomHash(dom2));
  });

  it('normalizes whitespace', () => {
    const dom1 = '<div>  \n  <button>Click</button> \n </div>';
    const dom2 = '<div> <button>Click</button> </div>';
    expect(computeDomHash(dom1)).toBe(computeDomHash(dom2));
  });

  it('returns 64 char hex', () => {
    expect(computeDomHash('<div></div>').length).toBe(64);
  });
});

describe('computeGoalHash', () => {
  it('same goal same hash', () => {
    expect(computeGoalHash('Fill login form')).toBe(computeGoalHash('Fill login form'));
  });

  it('different goal different hash', () => {
    expect(computeGoalHash('Fill login form')).not.toBe(computeGoalHash('Click submit button'));
  });

  it('returns 32 char hex (md5)', () => {
    expect(computeGoalHash('test').length).toBe(32);
  });
});

describe('buildCacheKey', () => {
  it('prefixed with action_cache', () => {
    const key = buildCacheKey('org_1', 'aabbccdd', 'eeff0011');
    expect(key.startsWith('action_cache:')).toBe(true);
  });

  it('includes org id', () => {
    const key = buildCacheKey('org_abc', 'dom_hash', 'goal_hash');
    expect(key).toContain('org_abc');
  });

  it('includes dom hash', () => {
    const key = buildCacheKey('org_1', 'dom_xyz', 'goal_123');
    expect(key).toContain('dom_xyz');
  });

  it('includes goal hash', () => {
    const key = buildCacheKey('org_1', 'dom_abc', 'goal_xyz');
    expect(key).toContain('goal_xyz');
  });
});

describe('ActionCacheStore', () => {
  let store: ActionCacheStore;

  beforeEach(() => {
    store = new ActionCacheStore();
  });

  it('miss returns null', () => {
    expect(store.get('nonexistent_key')).toBeNull();
  });

  it('set + get roundtrip', () => {
    const key = 'cache:org_1:aabbccdd:eeff0011';
    const value = { action: 'click', selector: '#submit' };
    store.set(key, value, 60);
    const retrieved = store.get(key);
    expect(retrieved).toEqual(value);
  });

  it('expired entry returns null', () => {
    const key = 'test_key';
    store.set(key, { data: 'test' }, 0); // TTL=0 秒，立即过期
    // 等待 1ms 让 Date.now 推进
    return new Promise((resolve) => {
      setTimeout(() => {
        expect(store.get(key)).toBeNull();
        resolve(undefined);
      }, 5);
    });
  });

  it('hit increments hit counter', () => {
    store.set('key1', { a: 1 }, 60);
    store.get('key1');
    expect(store.stats.hits).toBe(1);
  });

  it('miss increments miss counter', () => {
    store.get('nonexistent');
    expect(store.stats.misses).toBe(1);
  });

  it('delete removes entry', () => {
    store.set('key1', { a: 1 }, 60);
    const deleted = store.delete('key1');
    expect(deleted).toBe(true);
    expect(store.get('key1')).toBeNull();
  });

  it('delete nonexistent returns false', () => {
    expect(store.delete('nonexistent')).toBe(false);
  });

  it('clearByPrefix removes matching keys', () => {
    store.set('action_cache:org_1:a:b', { x: 1 }, 60);
    store.set('action_cache:org_1:c:d', { x: 2 }, 60);
    store.set('action_cache:org_2:e:f', { x: 3 }, 60);
    const removed = store.clearByPrefix('action_cache:org_1:');
    expect(removed).toBe(2);
    expect(store.get('action_cache:org_2:e:f')).toEqual({ x: 3 });
  });

  it('clearExpired removes only expired', () => {
    store.set('key1', { a: 1 }, 0); // 立即过期
    store.set('key2', { a: 2 }, 3600); // 1 小时
    return new Promise((resolve) => {
      setTimeout(() => {
        const removed = store.clearExpired();
        expect(removed).toBe(1);
        expect(store.get('key2')).toEqual({ a: 2 });
        resolve(undefined);
      }, 5);
    });
  });

  it('clearAll empties store', () => {
    store.set('key1', { a: 1 }, 60);
    store.set('key2', { a: 2 }, 60);
    const removed = store.clearAll();
    expect(removed).toBe(2);
    expect(store.stats.total_entries).toBe(0);
  });

  it('stats tracks hits and misses', () => {
    store.set('key1', { a: 1 }, 60);
    store.get('key1'); // hit
    store.get('key1'); // hit
    store.get('nonexistent'); // miss
    const stats = store.stats;
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.hit_rate).toBe(66.7); // 2/3 * 100
  });

  it('stats hit_rate when no requests', () => {
    expect(store.stats.hit_rate).toBe(0.0);
  });

  it('stats total_entries', () => {
    store.set('key1', { a: 1 }, 60);
    store.set('key2', { a: 2 }, 60);
    expect(store.stats.total_entries).toBe(2);
  });

  it('resetStats zeroes counters', () => {
    store.set('key1', { a: 1 }, 60);
    store.get('key1');
    store.get('nonexistent');
    store.resetStats();
    expect(store.stats.hits).toBe(0);
    expect(store.stats.misses).toBe(0);
  });

  it('cacheActionDecision helper', () => {
    const domHtml = '<div><button id="submit">Submit</button></div>';
    const goal = 'Click submit button';
    const decision = { action: 'click', selector: '#submit', confidence: 0.95 };
    const key = store.cacheActionDecision('org_1', domHtml, goal, decision, 60);
    expect(key).toContain('action_cache:org_1:');
    const retrieved = store.get(key);
    expect(retrieved).toEqual(decision);
  });

  it('lookupCachedDecision miss returns null', () => {
    const result = store.lookupCachedDecision('org_1', '<div>Test</div>', 'Goal');
    expect(result).toBeNull();
  });

  it('lookupCachedDecision hit returns decision', () => {
    const domHtml = '<form><input name="username"/></form>';
    const goal = 'Fill username';
    const decision = { action: 'fill', field: 'username', value: 'testuser' };
    store.cacheActionDecision('org_1', domHtml, goal, decision, 60);
    const retrieved = store.lookupCachedDecision('org_1', domHtml, goal);
    expect(retrieved).toEqual(decision);
  });

  it('default TTL is 86400', () => {
    expect(DEFAULT_CACHE_TTL).toBe(86400);
  });
});
