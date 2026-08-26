<script setup lang="ts">
// 毛玻璃卡片容器，贯穿所有 enterprise 页面复用。
withDefaults(
  defineProps<{
    hoverable?: boolean;
    padding?: 'sm' | 'md' | 'lg';
  }>(),
  { hoverable: true, padding: 'md' },
);

const paddingMap = { sm: 'p-4', md: 'p-6', lg: 'p-8' };
</script>

<template>
  <div
    :class="[hoverable ? 'glass-card' : 'glass-card-static', paddingMap[padding]]"
  >
    <slot />
  </div>
</template>
