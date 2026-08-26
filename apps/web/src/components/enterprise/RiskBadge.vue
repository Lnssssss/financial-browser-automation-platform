<script setup lang="ts">
// 风险等级徽章，色系按等级查表，label 走 i18n。
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{ level: string }>();

const riskConfig: Record<string, { bg: string; text: string }> = {
  low: { bg: 'bg-green-50', text: 'text-green-700' },
  medium: { bg: 'bg-amber-50', text: 'text-amber-700' },
  high: { bg: 'bg-red-50', text: 'text-red-700' },
  critical: { bg: 'bg-red-100', text: 'text-red-900' },
};

const riskLabelKeys: Record<string, string> = {
  low: 'common.riskLow',
  medium: 'common.riskMedium',
  high: 'common.riskHigh',
  critical: 'common.riskCritical',
};

const { t } = useI18n();

const config = computed(() => riskConfig[props.level] ?? { bg: 'bg-gray-50', text: 'text-gray-600' });
const label = computed(() => {
  const key = riskLabelKeys[props.level];
  return key ? t(key) : props.level;
});
</script>

<template>
  <span class="glass-badge" :class="[config.bg, config.text]">{{ label }}</span>
</template>
