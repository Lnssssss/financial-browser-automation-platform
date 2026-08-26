<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { VChart } from '@/plugins/echarts';
import type { ErrorDistribution } from './demoData';

const props = defineProps<{ data: ErrorDistribution }>();
const { t } = useI18n();

const errorNameKeys: Record<string, string> = {
  LLM_FAILURE: 'error.llmFailure',
  TIMEOUT: 'error.timeout',
  PAGE_ERROR: 'error.pageError',
  APPROVAL_REJECTED: 'error.approvalRejected',
  ELEMENT_NOT_FOUND: 'error.llmFailure',
  SESSION_EXPIRED: 'error.timeout',
};

const errorDisplayNames: Record<string, string> = {
  ELEMENT_NOT_FOUND: 'Element Not Found',
  SESSION_EXPIRED: 'Session Expired',
};

const option = computed(() => {
  const entries = Object.entries(props.data);
  const colors = ['#EF4444', '#F59E0B', '#8B5CF6', '#06B6D4', '#1A3A5C', '#C9A84C'];
  const total = entries.reduce((s, [, v]) => s + v, 0);
  return {
    tooltip: {
      trigger: 'item' as const,
      formatter: (p: { name: string; value: number; percent: number }) => `${p.name}: ${p.value} (${p.percent}%)`,
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderColor: '#E5E7EB',
      textStyle: { color: '#374155' },
    },
    graphic: [
      { type: 'text', left: 'center', top: '42%', style: { text: total.toString(), fontSize: 22, fontWeight: 'bold', fill: '#1A1D2E', textAlign: 'center' } },
      { type: 'text', left: 'center', top: '54%', style: { text: 'Total', fontSize: 12, fill: '#526077', textAlign: 'center' } },
    ],
    series: [
      {
        type: 'pie',
        radius: ['45%', '72%'],
        center: ['50%', '50%'],
        data: entries.map(([name, value], i) => ({
          name: errorDisplayNames[name] ?? (errorNameKeys[name] ? t(errorNameKeys[name]) : name),
          value,
          itemStyle: { color: colors[i % colors.length] },
        })),
        label: { color: '#374155', fontSize: 11, formatter: '{b}: {c}' },
        emphasis: { scaleSize: 6 },
      },
    ],
  };
});
</script>

<template>
  <VChart :option="option" style="height: 300px" autoresize />
</template>
