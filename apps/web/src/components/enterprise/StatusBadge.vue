<script setup lang="ts">
// 任务状态徽章，色系按状态查表，label 走 i18n；未知状态兜底灰色+裸值展示。
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{ status: string }>();

const statusConfig: Record<string, { bg: string; text: string }> = {
  running: { bg: 'bg-blue-50', text: 'text-blue-700' },
  completed: { bg: 'bg-green-50', text: 'text-green-700' },
  failed: { bg: 'bg-red-50', text: 'text-red-700' },
  pending_approval: { bg: 'bg-amber-50', text: 'text-amber-700' },
  needs_human: { bg: 'bg-orange-50', text: 'text-orange-700' },
  paused: { bg: 'bg-purple-50', text: 'text-purple-700' },
  queued: { bg: 'bg-gray-50', text: 'text-gray-600' },
  timeout: { bg: 'bg-red-50', text: 'text-red-800' },
  created: { bg: 'bg-sky-50', text: 'text-sky-700' },
  terminated: { bg: 'bg-gray-100', text: 'text-gray-700' },
  canceled: { bg: 'bg-gray-100', text: 'text-gray-600' },
};

const statusLabelKeys: Record<string, string> = {
  running: 'common.statusRunning',
  completed: 'common.statusCompleted',
  failed: 'common.statusFailed',
  pending_approval: 'common.statusPendingApproval',
  needs_human: 'common.statusNeedsHuman',
  paused: 'common.statusPaused',
  queued: 'common.statusQueued',
  timeout: 'common.statusTimeout',
  created: 'common.statusCreated',
  terminated: 'common.statusTerminated',
  canceled: 'common.statusCanceled',
};

const { t } = useI18n();

const config = computed(() => statusConfig[props.status] ?? { bg: 'bg-gray-50', text: 'text-gray-600' });
const label = computed(() => {
  const key = statusLabelKeys[props.status];
  return key ? t(key) : props.status;
});
</script>

<template>
  <span class="glass-badge" :class="[config.bg, config.text]">{{ label }}</span>
</template>
