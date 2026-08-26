<script setup lang="ts">
import { computed } from 'vue';
import Timeline, { type TimelineItem } from '@/components/enterprise/Timeline.vue';
import ScreenshotDiff from '@/components/enterprise/ScreenshotDiff.vue';
import type { AuditLogEntry } from '@/api/enterprise';

const props = defineProps<{ log: AuditLogEntry; expanded: boolean }>();
const emit = defineEmits<{ toggle: [] }>();

const timelineItem = computed<TimelineItem>(() => ({
  id: props.log.audit_log_id,
  title: `#${props.log.action_index} ${props.log.action_type}`,
  description: `${props.log.target_element}${props.log.input_value ? ` → ${props.log.input_value}` : ''} (${props.log.duration_ms}ms)`,
  timestamp: new Date(props.log.created_at).toLocaleTimeString(),
  status: props.log.execution_result === 'success' ? 'success' : 'error',
}));
</script>

<template>
  <div>
    <div class="cursor-pointer" @click="emit('toggle')">
      <Timeline :items="[timelineItem]" />
    </div>
    <div v-if="expanded && (log.screenshot_before_url || log.screenshot_after_url)" class="ml-12 mt-2">
      <ScreenshotDiff :before-url="log.screenshot_before_url" :after-url="log.screenshot_after_url" />
    </div>
    <div v-if="expanded && log.error_message" class="ml-12 mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
      {{ log.error_message }}
    </div>
  </div>
</template>
