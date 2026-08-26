<script setup lang="ts">
// Enterprise 审计日志：按任务分组的时间线视图，可展开查看前后截图对比。
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import GlassCard from '@/components/enterprise/GlassCard.vue';
import StatusBadge from '@/components/enterprise/StatusBadge.vue';
import Icon from '@/components/icons/Icon.vue';
import * as api from '@/api/enterprise';
import type { AuditLogEntry } from '@/api/enterprise';
import LogTimelineItem from './LogTimelineItem.vue';
import { demoLogs } from './demoData';

const { t } = useI18n();
const logs = ref<AuditLogEntry[]>([]);
const expandedIds = ref<Set<string>>(new Set());
const filterType = ref('all');

onMounted(async () => {
  try {
    const data = await api.queryAuditLogs();
    logs.value = data.items ?? (data as unknown as AuditLogEntry[]);
  } catch {
    logs.value = demoLogs();
  }
});

function toggleExpand(id: string) {
  const next = new Set(expandedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedIds.value = next;
}

const filteredLogs = computed(() =>
  filterType.value === 'all' ? logs.value : logs.value.filter((l) => l.action_type === filterType.value),
);

const groups = computed(() => {
  const map = new Map<string, AuditLogEntry[]>();
  for (const log of filteredLogs.value) {
    (map.get(log.task_id) ?? map.set(log.task_id, []).get(log.task_id)!).push(log);
  }
  return Array.from(map.entries()).map(([task_id, taskLogs]) => ({ task_id, logs: taskLogs }));
});

const actionTypes = computed(() => [...new Set(logs.value.map((l) => l.action_type))]);
</script>

<template>
  <div class="space-y-6 p-6">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <Icon name="audit" :size="24" color="var(--finrpa-blue)" />
        <h1 class="text-xl font-bold" style="color: var(--finrpa-blue)">{{ t('audit.title') }}</h1>
      </div>
      <div class="flex items-center gap-3">
        <Icon name="filter" :size="16" color="var(--finrpa-text-muted)" />
        <select v-model="filterType" class="glass-input text-sm">
          <option value="all">{{ t('audit.allTypes') }}</option>
          <option v-for="actionType in actionTypes" :key="actionType" :value="actionType">{{ actionType }}</option>
        </select>
      </div>
    </div>

    <GlassCard v-for="group in groups" :key="group.task_id" :hoverable="false" padding="md">
      <div class="mb-4 flex items-center gap-3">
        <Icon name="task" :size="20" color="var(--finrpa-blue)" />
        <h3 class="text-sm font-semibold" style="color: var(--finrpa-text-primary)">{{ t('audit.task') }}: {{ group.task_id }}</h3>
        <StatusBadge :status="group.logs.some((l) => l.execution_result === 'failed') ? 'failed' : 'completed'" />
        <span class="text-xs" style="color: var(--finrpa-text-muted)">
          {{ t('audit.actionCount', { count: group.logs.length }) }}
        </span>
      </div>
      <div class="space-y-2">
        <LogTimelineItem
          v-for="log in group.logs"
          :key="log.audit_log_id"
          :log="log"
          :expanded="expandedIds.has(log.audit_log_id)"
          @toggle="toggleExpand(log.audit_log_id)"
        />
      </div>
    </GlassCard>
  </div>
</template>
