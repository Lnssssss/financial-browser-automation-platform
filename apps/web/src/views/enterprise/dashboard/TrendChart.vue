<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { VChart } from '@/plugins/echarts';
import type { TrendItem } from './demoData';

const props = defineProps<{ data: TrendItem[] }>();
const { t } = useI18n();

const option = computed(() => ({
  tooltip: {
    trigger: 'axis' as const,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderColor: '#E5E7EB',
    textStyle: { color: '#374155' },
  },
  legend: { data: [t('dashboard.chartSuccess'), t('dashboard.chartFailed')], bottom: 0, textStyle: { color: '#374155' } },
  grid: { left: 45, right: 20, top: 20, bottom: 40 },
  xAxis: {
    type: 'category' as const,
    data: props.data.map((d) => d.date.slice(5)),
    axisLine: { lineStyle: { color: '#D1D5DB' } },
    axisLabel: { color: '#374155', fontSize: 11, interval: 4 },
    boundaryGap: false,
  },
  yAxis: {
    type: 'value' as const,
    axisLine: { show: false },
    splitLine: { lineStyle: { color: '#E5E7EB' } },
    axisLabel: { color: '#374155' },
  },
  series: [
    {
      name: t('dashboard.chartSuccess'),
      type: 'line',
      smooth: true,
      data: props.data.map((d) => d.success),
      lineStyle: { color: '#10B981', width: 2 },
      itemStyle: { color: '#10B981' },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [{ offset: 0, color: 'rgba(16,185,129,0.18)' }, { offset: 1, color: 'rgba(16,185,129,0.02)' }],
        },
      },
      symbol: 'none',
    },
    {
      name: t('dashboard.chartFailed'),
      type: 'line',
      smooth: true,
      data: props.data.map((d) => d.failed),
      lineStyle: { color: '#EF4444', width: 2 },
      itemStyle: { color: '#EF4444' },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [{ offset: 0, color: 'rgba(239,68,68,0.10)' }, { offset: 1, color: 'rgba(239,68,68,0.01)' }],
        },
      },
      symbol: 'none',
    },
  ],
}));
</script>

<template>
  <VChart :option="option" style="height: 300px" autoresize />
</template>
