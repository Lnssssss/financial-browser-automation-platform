<script setup lang="ts">
// Section 3: 模型路由 —— 堆叠条形图展示各档位调用占比。
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import GlassCard from '@/components/enterprise/GlassCard.vue';
import { VChart } from '@/plugins/echarts';
import { tierLabels, tierColors, type CostData } from './demoData';

const props = defineProps<{ cost: CostData }>();
const { t } = useI18n();

const total = computed(() => props.cost.breakdown.reduce((sum, b) => sum + b.total_calls, 0));

const barOption = computed(() => ({
  grid: { left: 10, right: 10, top: 10, bottom: 10, containLabel: false },
  xAxis: { type: 'value' as const, show: false, max: total.value },
  yAxis: { type: 'category' as const, show: false, data: [''] },
  series: props.cost.breakdown.map((b) => ({
    type: 'bar' as const,
    stack: 'total',
    name: b.model_tier,
    data: [b.total_calls],
    barWidth: 32,
    itemStyle: {
      color: tierColors[b.model_tier],
      borderRadius:
        b.model_tier === 'LIGHT' ? [4, 0, 0, 4] : b.model_tier === 'HEAVY' ? [0, 4, 4, 0] : 0,
    },
  })),
  tooltip: { trigger: 'item' as const, formatter: '{a}: {c}' },
}));

function pct(calls: number): string {
  return total.value > 0 ? ((calls / total.value) * 100).toFixed(1) : '0';
}
</script>

<template>
  <GlassCard padding="md" :hoverable="false">
    <p class="mb-4 text-xs font-medium uppercase tracking-wider" :style="{ color: 'var(--finrpa-text-muted)' }">
      {{ t('llm.routingDistribution') }}
    </p>
    <VChart :option="barOption" style="height: 60px" autoresize />
    <div class="mt-4 flex justify-around">
      <div v-for="b in cost.breakdown" :key="b.model_tier" class="text-center">
        <div class="flex items-center justify-center gap-1.5">
          <div class="h-2.5 w-2.5 rounded-full" :style="{ background: tierColors[b.model_tier] }" />
          <span class="text-sm font-semibold" :style="{ color: 'var(--finrpa-text-primary)' }">
            {{ b.model_tier }}
          </span>
        </div>
        <p class="text-xs" :style="{ color: 'var(--finrpa-text-muted)' }">
          {{ tierLabels[b.model_tier] }}
        </p>
        <p class="mt-1 text-lg font-bold" :style="{ color: tierColors[b.model_tier] }">
          {{ pct(b.total_calls) }}%
        </p>
        <p class="text-xs" :style="{ color: 'var(--finrpa-text-muted)' }">
          {{ b.total_calls.toLocaleString() }} {{ t('llm.calls') }}
        </p>
      </div>
    </div>
  </GlassCard>
</template>
