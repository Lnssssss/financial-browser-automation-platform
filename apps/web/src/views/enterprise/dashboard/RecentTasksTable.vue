<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import StatusBadge from '@/components/enterprise/StatusBadge.vue';
import type { RecentTask } from './demoData';

defineProps<{ data: RecentTask[] }>();
const { t } = useI18n();
</script>

<template>
  <div class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead>
        <tr style="border-bottom: 1px solid var(--glass-border)">
          <th class="pb-3 text-left font-medium" style="color: var(--finrpa-text-muted)">{{ t('dashboard.taskName') }}</th>
          <th class="pb-3 text-left font-medium" style="color: var(--finrpa-text-muted)">{{ t('dashboard.status') }}</th>
          <th class="pb-3 text-left font-medium" style="color: var(--finrpa-text-muted)">{{ t('dashboard.department') }}</th>
          <th class="pb-3 text-right font-medium" style="color: var(--finrpa-text-muted)">{{ t('dashboard.duration') }}</th>
          <th class="pb-3 text-right font-medium" style="color: var(--finrpa-text-muted)">{{ t('dashboard.time') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="task in data" :key="task.id" style="border-bottom: 1px solid var(--glass-border)">
          <td class="max-w-[280px] truncate py-3 pr-4" style="color: var(--finrpa-text-primary)" :title="task.name">
            {{ task.name }}
          </td>
          <td class="py-3"><StatusBadge :status="task.status" /></td>
          <td class="py-3 text-xs" style="color: var(--finrpa-text-secondary)">{{ task.department }}</td>
          <td class="py-3 text-right tabular-nums" style="color: var(--finrpa-text-secondary)">
            {{ task.status === 'running' || task.status === 'pending_approval' ? '—' : `${task.duration_s}${t('dashboard.seconds')}` }}
          </td>
          <td class="py-3 text-right tabular-nums" style="color: var(--finrpa-text-muted)">{{ task.time }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
