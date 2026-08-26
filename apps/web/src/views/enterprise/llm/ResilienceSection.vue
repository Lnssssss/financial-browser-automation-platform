<script setup lang="ts">
// Section 4: 韧性统计 —— 四张汇总卡（调用/缓存/Token/缓存率）。
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import GlassCard from '@/components/enterprise/GlassCard.vue';
import Icon from '@/components/icons/Icon.vue';
import type { IconName } from '@/components/icons/iconPaths';
import type { CostData } from './demoData';

const props = defineProps<{ cost: CostData }>();
const { t } = useI18n();

const items = computed(() => {
  const totalCalls = props.cost.breakdown.reduce((s, b) => s + b.total_calls, 0);
  const cachedCalls = props.cost.breakdown.reduce((s, b) => s + b.cached_calls, 0);
  const totalTokens = props.cost.breakdown.reduce((s, b) => s + b.total_tokens, 0);
  return [
    { label: t('llm.totalLlmCalls'), value: totalCalls.toLocaleString(), icon: 'workflow' as IconName, color: 'var(--finrpa-blue)' },
    { label: t('llm.cachedResponses'), value: cachedCalls.toLocaleString(), icon: 'check-circle' as IconName, color: '#10B981' },
    { label: t('llm.totalTokens'), value: (totalTokens / 1000).toFixed(0) + 'K', icon: 'audit' as IconName, color: '#8B5CF6' },
    { label: t('llm.avgCacheRate'), value: (totalCalls > 0 ? ((cachedCalls / totalCalls) * 100).toFixed(1) : '0') + '%', icon: 'refresh' as IconName, color: '#F59E0B' },
  ];
});
</script>

<template>
  <div class="grid grid-cols-2 gap-5 xl:grid-cols-4">
    <GlassCard v-for="item in items" :key="item.label" padding="md">
      <div class="flex items-center gap-3">
        <div
          class="flex h-10 w-10 items-center justify-center rounded-lg"
          :style="{ background: `${item.color}10` }"
        >
          <Icon :name="item.icon" :size="20" :color="item.color" />
        </div>
        <div>
          <p class="text-xs" :style="{ color: 'var(--finrpa-text-muted)' }">{{ item.label }}</p>
          <p class="text-lg font-bold" :style="{ color: 'var(--finrpa-text-primary)' }">{{ item.value }}</p>
        </div>
      </div>
    </GlassCard>
  </div>
</template>
