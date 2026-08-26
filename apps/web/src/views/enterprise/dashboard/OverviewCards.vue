<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import GlassCard from '@/components/enterprise/GlassCard.vue';
import Icon from '@/components/icons/Icon.vue';
import type { IconName } from '@/components/icons/iconPaths';
import type { OverviewData } from './demoData';

const props = defineProps<{ data: OverviewData }>();
const { t } = useI18n();

const cards = computed(() => [
  {
    title: t('dashboard.totalTasks'),
    value: props.data.total_tasks.toLocaleString(),
    icon: 'task' as IconName,
    color: 'var(--finrpa-blue)',
    delta: props.data.delta_tasks != null ? `+${props.data.delta_tasks}%` : null,
    deltaUp: true,
  },
  {
    title: t('dashboard.successRate'),
    value: `${props.data.success_rate_today}%`,
    icon: 'check-circle' as IconName,
    color: 'var(--status-completed)',
    delta: props.data.delta_success != null ? `+${props.data.delta_success}pp` : null,
    deltaUp: true,
  },
  {
    title: t('dashboard.pendingApproval'),
    value: props.data.pending_approvals.toString(),
    icon: 'clock' as IconName,
    color: 'var(--finrpa-gold)',
    delta: null,
    deltaUp: false,
  },
  {
    title: t('dashboard.needsHuman'),
    value: props.data.needs_human_count.toString(),
    icon: 'user-check' as IconName,
    color: 'var(--status-needs-human)',
    delta: null,
    deltaUp: false,
  },
]);
</script>

<template>
  <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
    <GlassCard v-for="card in cards" :key="card.title" padding="md">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-xs font-medium uppercase tracking-wider" style="color: var(--finrpa-text-muted)">
            {{ card.title }}
          </p>
          <p class="mt-1 text-2xl font-bold" style="color: var(--finrpa-text-primary)">{{ card.value }}</p>
          <p
            v-if="card.delta"
            class="mt-1 text-xs"
            :style="{ color: card.deltaUp ? 'var(--status-completed)' : 'var(--status-failed)' }"
          >
            {{ card.delta }} {{ t('dashboard.vsYesterday') }}
          </p>
        </div>
        <div class="flex h-12 w-12 items-center justify-center rounded-xl" :style="{ background: `${card.color}10` }">
          <Icon :name="card.icon" :size="24" :color="card.color" />
        </div>
      </div>
    </GlassCard>
  </div>
</template>
