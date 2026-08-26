<script setup lang="ts">
// Section 5: 人工干预队列 —— 卡住任务列表（含 LLM 错误轨迹 + 操作按钮）；空态显示健康提示。
import { useI18n } from 'vue-i18n';
import GlassCard from '@/components/enterprise/GlassCard.vue';
import StatusBadge from '@/components/enterprise/StatusBadge.vue';
import Icon from '@/components/icons/Icon.vue';
import type { StuckTask } from './demoData';

const props = defineProps<{ tasks: StuckTask[] }>();
const { t } = useI18n();

function stuckMinutes(since: string): number {
  return Math.floor((Date.now() - new Date(since).getTime()) / 60000);
}
</script>

<template>
  <GlassCard v-if="props.tasks.length === 0" padding="md">
    <div class="flex flex-col items-center py-8" :style="{ color: 'var(--finrpa-text-muted)' }">
      <Icon name="check-circle" :size="40" color="#10B981" />
      <p class="mt-3 text-sm font-medium">{{ t('llm.noStuckTasks') }}</p>
    </div>
  </GlassCard>

  <div v-else class="space-y-4">
    <GlassCard v-for="task in props.tasks" :key="task.task_id" padding="md">
      <div class="flex items-start justify-between">
        <div class="flex-1">
          <div class="flex items-center gap-3">
            <span class="text-sm font-semibold" :style="{ color: 'var(--finrpa-text-primary)' }">
              {{ task.task_id }}
            </span>
            <StatusBadge status="needs_human" />
            <span class="text-xs" :style="{ color: 'var(--finrpa-text-muted)' }">
              {{ task.department_name }}
            </span>
          </div>
          <p class="mt-1 text-xs" :style="{ color: 'var(--finrpa-text-muted)' }">
            {{ t('llm.stuckAction') }}: <strong>{{ task.stuck_action_type }}</strong> —
            {{ t('llm.stuckFor') }} {{ stuckMinutes(task.stuck_since) }} {{ t('llm.minutes') }}
          </p>
          <p class="mt-0.5 truncate text-xs" :style="{ color: 'var(--finrpa-text-muted)' }">
            {{ task.page_url }}
          </p>

          <!-- LLM error trail -->
          <div class="mt-3 space-y-1">
            <p class="text-xs font-medium" :style="{ color: '#EF4444' }">
              {{ t('llm.retryErrors') }} ({{ task.llm_errors.length }}/3):
            </p>
            <div
              v-for="(err, i) in task.llm_errors"
              :key="i"
              class="rounded px-2 py-1 text-xs"
              :style="{ background: 'rgba(239,68,68,0.06)', color: '#991B1B' }"
            >
              #{{ i + 1 }}: {{ err }}
            </div>
          </div>
        </div>

        <!-- Action buttons -->
        <div class="ml-4 flex flex-col gap-2">
          <button class="glass-btn-primary px-3 py-1.5 text-xs">{{ t('llm.actionSkip') }}</button>
          <button class="glass-btn-secondary px-3 py-1.5 text-xs">{{ t('llm.actionManual') }}</button>
          <button
            class="rounded px-3 py-1.5 text-xs font-medium"
            :style="{ background: 'rgba(239,68,68,0.08)', color: '#DC2626' }"
          >
            {{ t('llm.actionTerminate') }}
          </button>
        </div>
      </div>
    </GlassCard>
  </div>
</template>
