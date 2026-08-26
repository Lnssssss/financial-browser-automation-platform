<script setup lang="ts">
// 部门树递归组件：Vue SFC 默认可通过文件名自引用实现递归（无需显式 name 注册）。
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Icon from '@/components/icons/Icon.vue';
import { deptNameKeys, type Department } from './demoData';

const props = withDefaults(
  defineProps<{
    departments: Department[];
    selectedId: string | null;
    depth?: number;
  }>(),
  { depth: 0 },
);
const emit = defineEmits<{ select: [id: string] }>();

const { t } = useI18n();
const expandedIds = ref<Set<string>>(new Set(props.departments.map((d) => d.id)));

function toggleExpand(id: string) {
  const next = new Set(expandedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedIds.value = next;
}
</script>

<template>
  <div>
    <div v-for="dept in departments" :key="dept.id">
      <div
        class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors"
        :class="selectedId === dept.id ? 'bg-blue-50 font-semibold' : 'hover:bg-gray-50'"
        :style="{
          paddingLeft: `${depth * 16 + 8}px`,
          color: selectedId === dept.id ? 'var(--finrpa-blue)' : 'var(--finrpa-text-primary)',
        }"
        @click="emit('select', dept.id)"
      >
        <span
          v-if="dept.children && dept.children.length > 0"
          class="flex h-4 w-4 items-center justify-center"
          @click.stop="toggleExpand(dept.id)"
        >
          <Icon :name="expandedIds.has(dept.id) ? 'chevron-down' : 'chevron-up'" :size="16" />
        </span>
        <span v-else class="w-4" />
        <Icon name="department" :size="16" />
        {{ deptNameKeys[dept.name] ? t(deptNameKeys[dept.name]) : dept.name }}
      </div>
      <DeptTree
        v-if="dept.children && dept.children.length > 0 && expandedIds.has(dept.id)"
        :departments="dept.children"
        :selected-id="selectedId"
        :depth="depth + 1"
        @select="emit('select', $event)"
      />
    </div>
  </div>
</template>
