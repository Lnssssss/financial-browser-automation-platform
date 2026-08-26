<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { VChart } from '@/plugins/echarts';
import type { BLComparison } from './demoData';

const props = defineProps<{ data: BLComparison[] }>();
const { t } = useI18n();

const blKeyMap: Record<string, string> = {
  'Corporate Lending': 'dashboard.blCorporateLending',
  'Retail Credit': 'dashboard.blRetailCredit',
  'Wealth Management': 'dashboard.blWealthManagement',
  'Intl Settlement': 'dashboard.blIntlSettlement',
  'Trade Finance': 'dashboard.blTradeFinance',
  'Risk & Compliance': 'dashboard.blRiskCompliance',
};

const option = computed(() => {
  const sorted = [...props.data].sort((a, b) => b.success_rate - a.success_rate);
  return {
    grid: { left: 110, right: 50, top: 15, bottom: 15 },
    xAxis: {
      type: 'value' as const,
      min: 85,
      max: 100,
      axisLabel: { formatter: '{value}%', color: '#374155' },
      splitLine: { lineStyle: { color: '#E5E7EB' } },
    },
    yAxis: {
      type: 'category' as const,
      data: sorted.map((d) => (blKeyMap[d.business_line_id] ? t(blKeyMap[d.business_line_id]) : d.business_line_id)),
      axisLabel: { color: '#374155', fontSize: 12 },
      axisLine: { lineStyle: { color: '#D1D5DB' } },
    },
    tooltip: {
      trigger: 'axis' as const,
      formatter: (params: Array<{ name: string; value: number; dataIndex: number }>) => {
        const p = params[0];
        if (!p) return '';
        const item = sorted[p.dataIndex];
        return `${p.name}<br/>${t('dashboard.successRateLabel')}: ${p.value}%<br/>${t('dashboard.totalTasks')}: ${item?.total_tasks.toLocaleString() ?? ''}`;
      },
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderColor: '#E5E7EB',
      textStyle: { color: '#374155' },
    },
    series: [
      {
        type: 'bar',
        data: sorted.map((d) => ({
          value: d.success_rate,
          itemStyle: {
            color: d.success_rate >= 97 ? '#10B981' : d.success_rate >= 95 ? '#1A3A5C' : d.success_rate >= 93 ? '#F59E0B' : '#EF4444',
            borderRadius: [0, 4, 4, 0],
          },
        })),
        barWidth: 18,
        label: { show: true, position: 'right' as const, formatter: '{c}%', fontSize: 11, color: '#374155' },
      },
    ],
  };
});
</script>

<template>
  <VChart :option="option" style="height: 260px" autoresize />
</template>
