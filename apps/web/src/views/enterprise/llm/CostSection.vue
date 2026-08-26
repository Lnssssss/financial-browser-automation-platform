<script setup lang="ts">
// Section 1: 成本分析 —— 汇总卡 + 档位表 + 环形饼图。
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import GlassCard from '@/components/enterprise/GlassCard.vue';
import { VChart } from '@/plugins/echarts';
import { tierLabels, tierColors, type CostData } from './demoData';

const props = defineProps<{ data: CostData }>();
const { t } = useI18n();

const pieOption = computed(() => ({
  color: props.data.breakdown.map((b) => tierColors[b.model_tier] ?? '#999'),
  tooltip: {
    trigger: 'item' as const,
    formatter: '{b}: ${c} ({d}%)',
  },
  series: [
    {
      type: 'pie',
      radius: ['45%', '70%'],
      data: props.data.breakdown.map((b) => ({
        name: tierLabels[b.model_tier] ?? b.model_tier,
        value: Number(b.estimated_cost_usd.toFixed(2)),
        itemStyle: { color: tierColors[b.model_tier] ?? '#999' },
      })),
      label: { color: '#374155', fontSize: 11 },
      emphasis: { scaleSize: 6 },
    },
  ],
}));
</script>

<template>
  <div class="grid grid-cols-1 gap-5 xl:grid-cols-3">
    <!-- Summary card -->
    <GlassCard padding="md">
      <p class="text-xs font-medium uppercase tracking-wider" :style="{ color: 'var(--finrpa-text-muted)' }">
        {{ t('llm.totalCost') }}
      </p>
      <p class="mt-1 text-3xl font-bold" :style="{ color: 'var(--finrpa-blue)' }">
        ${{ data.total_cost_usd.toFixed(2) }}
      </p>
      <div class="mt-3 flex items-center gap-2">
        <div
          class="rounded-full px-2 py-0.5 text-xs font-medium"
          :style="{ background: 'rgba(16,185,129,0.1)', color: '#10B981' }"
        >
          {{ t('llm.saved') }} ${{ data.total_saved_usd.toFixed(2) }}
        </div>
        <span class="text-xs" :style="{ color: 'var(--finrpa-text-muted)' }">
          {{ t('llm.viaCaching') }}
        </span>
      </div>
    </GlassCard>

    <!-- Tier table -->
    <GlassCard padding="md">
      <p class="mb-3 text-xs font-medium uppercase tracking-wider" :style="{ color: 'var(--finrpa-text-muted)' }">
        {{ t('llm.tierBreakdown') }}
      </p>
      <div class="space-y-3">
        <div v-for="b in data.breakdown" :key="b.model_tier" class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="h-2.5 w-2.5 rounded-full" :style="{ background: tierColors[b.model_tier] }" />
            <span class="text-sm font-medium" :style="{ color: 'var(--finrpa-text-primary)' }">
              {{ tierLabels[b.model_tier] ?? b.model_tier }}
            </span>
          </div>
          <div class="text-right">
            <span class="text-sm font-semibold" :style="{ color: 'var(--finrpa-text-primary)' }">
              {{ b.total_calls.toLocaleString() }} {{ t('llm.calls') }}
            </span>
            <span class="ml-2 text-xs" :style="{ color: 'var(--finrpa-text-muted)' }">
              ${{ b.estimated_cost_usd.toFixed(2) }}
            </span>
          </div>
        </div>
      </div>
    </GlassCard>

    <!-- Pie chart -->
    <GlassCard padding="md" :hoverable="false">
      <p class="mb-1 text-xs font-medium uppercase tracking-wider" :style="{ color: 'var(--finrpa-text-muted)' }">
        {{ t('llm.costDistribution') }}
      </p>
      <VChart :option="pieOption" style="height: 180px" autoresize />
    </GlassCard>
  </div>
</template>
