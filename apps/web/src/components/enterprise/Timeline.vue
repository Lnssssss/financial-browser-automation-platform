<script setup lang="ts">
// 时间线组件：审计日志/任务步骤可视化。每项一个圆点/图标 + 标题/描述/时间戳，
// 竖线连接相邻项。children 用具名 slot #extra（按 item.id 传参）替代 React 的 item.children。
import Icon from '@/components/icons/Icon.vue';
import type { IconName } from '@/components/icons/iconPaths';

export interface TimelineItem {
  id: string;
  title: string;
  description?: string;
  timestamp: string;
  icon?: IconName;
  status?: 'success' | 'error' | 'warning' | 'info';
}

defineProps<{ items: TimelineItem[] }>();

const statusDotColor: Record<string, string> = {
  success: 'bg-green-500',
  error: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-blue-500',
};
</script>

<template>
  <div class="relative">
    <div v-for="(item, index) in items" :key="item.id" class="relative flex gap-4 pb-8 last:pb-0">
      <div v-if="index < items.length - 1" class="absolute left-[15px] top-8 h-full w-px bg-gray-200" />

      <div class="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center">
        <div
          v-if="item.icon"
          class="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-200"
        >
          <Icon :name="item.icon" :size="16" color="var(--finrpa-blue)" />
        </div>
        <div v-else class="h-3 w-3 rounded-full ring-4 ring-white" :class="statusDotColor[item.status ?? 'info']" />
      </div>

      <div class="flex-1 pt-0.5">
        <div class="flex items-center justify-between">
          <h4 class="text-sm font-medium" style="color: var(--finrpa-text-primary)">{{ item.title }}</h4>
          <time class="text-xs" style="color: var(--finrpa-text-muted)">{{ item.timestamp }}</time>
        </div>
        <p v-if="item.description" class="mt-1 text-sm" style="color: var(--finrpa-text-secondary)">
          {{ item.description }}
        </p>
        <div class="mt-2">
          <slot name="extra" :item="item" />
        </div>
      </div>
    </div>
  </div>
</template>
