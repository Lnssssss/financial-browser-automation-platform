<script setup lang="ts">
// SVG 图标组件，等价源 React <Icon>：按 name 查表拿路径标记，套 svg 外壳渲染。
// v-html 安全前提：iconPaths 是固定常量表，非用户输入。
import { computed } from 'vue';
import { iconPaths, type IconName } from './iconPaths';

const props = withDefaults(
  defineProps<{
    name: IconName;
    size?: number;
    color?: string;
  }>(),
  { size: 20, color: 'currentColor' },
);

const markup = computed(() => iconPaths[props.name] ?? '');
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    :style="{ color }"
    v-html="markup"
  />
</template>
