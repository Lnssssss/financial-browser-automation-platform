<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { VChart } from '@/plugins/echarts';
import type { ApprovalHour } from './demoData';

const props = defineProps<{ data: ApprovalHour[] }>();
const { t } = useI18n();

const option = computed(() => ({
  tooltip: {
    trigger: 'axis' as const,
    formatter: (params: Array<{ dataIndex: number; value: number }>) => {
      const p = params[0];
      if (!p) return '';
      const item = props.data[p.dataIndex];
      return `${p.dataIndex}:00 - ${p.dataIndex}:59<br/>${t('dashboard.avgResponseMin')}: ${p.value}<br/>${t('dashboard.calls')}: ${item?.count ?? 0}`;
    },
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderColor: '#E5E7EB',
    textStyle: { color: '#374155' },
  },
  grid: { left: 45, right: 20, top: 15, bottom: 30 },
  xAxis: {
    type: 'category' as const,
    data: props.data.map((d) => `${d.hour}:00`),
    axisLine: { lineStyle: { color: '#D1D5DB' } },
    axisLabel: { color: '#374155', fontSize: 10, interval: 2 },
  },
  yAxis: {
    type: 'value' as const,
    name: 'min',
    nameTextStyle: { color: '#526077', fontSize: 11 },
    axisLine: { show: false },
    splitLine: { lineStyle: { color: '#E5E7EB' } },
    axisLabel: { color: '#374155' },
  },
  series: [
    {
      type: 'bar',
      data: props.data.map((d) => ({
        value: d.avg_minutes,
        itemStyle: {
          color: d.avg_minutes <= 10 ? '#10B981' : d.avg_minutes <= 20 ? '#C9A84C' : '#EF4444',
          borderRadius: [3, 3, 0, 0],
        },
      })),
      barWidth: 14,
    },
  ],
}));
</script>

<template>
  <VChart :option="option" style="height: 240px" autoresize />
</template>
