<script setup lang="ts">
// Section 2: 缓存性能 —— 命中率仪表盘 + 四项统计卡。
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import GlassCard from '@/components/enterprise/GlassCard.vue';
import { VChart } from '@/plugins/echarts';
import type { CacheStats } from './demoData';

const props = defineProps<{ data: CacheStats }>();
const { t } = useI18n();

const gaugeOption = computed(() => ({
  series: [
    {
      type: 'gauge',
      startAngle: 200,
      endAngle: -20,
      min: 0,
      max: 100,
      pointer: { show: false },
      progress: {
        show: true,
        width: 16,
        roundCap: true,
        itemStyle: {
          color:
            props.data.hit_rate >= 50 ? '#10B981' : props.data.hit_rate >= 20 ? '#F59E0B' : '#EF4444',
        },
      },
      axisLine: { lineStyle: { width: 16, color: [[1, '#E5E7EB']] } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      detail: {
        valueAnimation: true,
        formatter: '{value}%',
        fontSize: 28,
        fontWeight: 'bold' as const,
        color: 'var(--finrpa-text-primary)',
        offsetCenter: [0, '10%'],
      },
      title: {
        show: true,
        offsetCenter: [0, '45%'],
        fontSize: 12,
        color: 'var(--finrpa-text-muted)',
      },
      data: [{ value: Number(props.data.hit_rate.toFixed(1)), name: t('llm.hitRate') }],
    },
  ],
}));

const stats = computed(() => [
  { label: t('llm.cacheEntries'), value: props.data.total_entries.toLocaleString(), color: 'var(--finrpa-blue)' },
  { label: t('llm.cacheHits'), value: props.data.hits.toLocaleString(), color: '#10B981' },
  { label: t('llm.cacheMisses'), value: props.data.misses.toLocaleString(), color: '#EF4444' },
  { label: t('llm.cacheSets'), value: props.data.sets.toLocaleString(), color: '#F59E0B' },
]);
</script>

<template>
  <div class="grid grid-cols-1 gap-5 xl:grid-cols-2">
    <GlassCard padding="md" :hoverable="false">
      <p class="mb-1 text-xs font-medium uppercase tracking-wider" :style="{ color: 'var(--finrpa-text-muted)' }">
        {{ t('llm.cacheHitRate') }}
      </p>
      <VChart :option="gaugeOption" style="height: 220px" autoresize />
    </GlassCard>

    <GlassCard padding="md">
      <p class="mb-4 text-xs font-medium uppercase tracking-wider" :style="{ color: 'var(--finrpa-text-muted)' }">
        {{ t('llm.cacheDetails') }}
      </p>
      <div class="grid grid-cols-2 gap-4">
        <div
          v-for="s in stats"
          :key="s.label"
          class="rounded-lg p-3"
          :style="{ background: 'var(--glass-bg-subtle, rgba(255,255,255,0.4))' }"
        >
          <p class="text-xs" :style="{ color: 'var(--finrpa-text-muted)' }">{{ s.label }}</p>
          <p class="mt-1 text-xl font-bold" :style="{ color: s.color }">{{ s.value }}</p>
        </div>
      </div>
    </GlassCard>
  </div>
</template>
