<script setup lang="ts">
/**
 * LLM Monitor — LLM 相关企业能力的可视化看板。
 * 五个板块：韧性概览 / 成本分析 / 模型路由 / 缓存性能 / 人工干预队列。
 * 真实 API 优先，失败降级演示数据（对齐源码策略）；卡住任务暂为演示。
 */
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import Icon from '@/components/icons/Icon.vue';
import * as api from '@/api/enterprise';
import ResilienceSection from './ResilienceSection.vue';
import CostSection from './CostSection.vue';
import RoutingSection from './RoutingSection.vue';
import CacheSection from './CacheSection.vue';
import HumanQueueSection from './HumanQueueSection.vue';
import {
  demoCost, demoCacheStats, demoStuckTasks,
  type CostData, type CacheStats, type StuckTask,
} from './demoData';

const { t } = useI18n();

const cost = ref<CostData | null>(null);
const cache = ref<CacheStats | null>(null);
const stuckTasks = ref<StuckTask[]>([]);

onMounted(async () => {
  try {
    const [costResp, cacheResp] = await Promise.all([
      api.getCost().catch(() => null),
      api.getCacheStats().catch(() => null),
    ]);
    cost.value = costResp ?? demoCost();
    cache.value = cacheResp ?? demoCacheStats();
  } catch {
    cost.value = demoCost();
    cache.value = demoCacheStats();
  }
  // 卡住任务 — 暂为演示数据
  stuckTasks.value = demoStuckTasks();
});
</script>

<template>
  <div v-if="cost && cache" class="space-y-6 p-6">
    <!-- Header -->
    <div class="flex items-center gap-3">
      <Icon name="workflow" :size="24" color="var(--finrpa-blue)" />
      <h1 class="text-xl font-bold" :style="{ color: 'var(--finrpa-blue)' }">
        {{ t('llm.title') }}
      </h1>
    </div>

    <!-- Section 1: Resilience overview -->
    <ResilienceSection :cost="cost" />

    <!-- Section 2: Cost Analysis -->
    <div>
      <h2 class="mb-3 text-sm font-semibold" :style="{ color: 'var(--finrpa-text-primary)' }">
        {{ t('llm.costAnalysis') }}
      </h2>
      <CostSection :data="cost" />
    </div>

    <!-- Section 3: Model Routing -->
    <div>
      <h2 class="mb-3 text-sm font-semibold" :style="{ color: 'var(--finrpa-text-primary)' }">
        {{ t('llm.modelRouting') }}
      </h2>
      <RoutingSection :cost="cost" />
    </div>

    <!-- Section 4: Cache Performance -->
    <div>
      <h2 class="mb-3 text-sm font-semibold" :style="{ color: 'var(--finrpa-text-primary)' }">
        {{ t('llm.cachePerformance') }}
      </h2>
      <CacheSection :data="cache" />
    </div>

    <!-- Section 5: Human Intervention Queue -->
    <div>
      <h2 class="mb-3 text-sm font-semibold" :style="{ color: 'var(--finrpa-text-primary)' }">
        {{ t('llm.humanQueue') }}
      </h2>
      <HumanQueueSection :tasks="stuckTasks" />
    </div>
  </div>
</template>
