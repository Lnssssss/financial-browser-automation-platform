<script setup lang="ts">
/**
 * Enterprise Permissions — department tree + user list + business line tags.
 * Supports visual configuration of user department/business-line/role combos.
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import GlassCard from '@/components/enterprise/GlassCard.vue';
import Icon from '@/components/icons/Icon.vue';
import DeptTree from './DeptTree.vue';
import {
  demoDepartments,
  demoUsers,
  roleColors,
  deptNameKeys,
  roleNameKeys,
  blNameKeys,
} from './demoData';

const { t } = useI18n();
const selectedDept = ref<string | null>(null);

const filteredUsers = computed(() => {
  if (!selectedDept.value) return demoUsers;
  const dept = [
    ...demoDepartments,
    ...demoDepartments.flatMap((d) => d.children ?? []),
  ].find((d) => d.id === selectedDept.value);
  return dept ? demoUsers.filter((u) => u.department === dept.name) : [];
});

function deptLabel(name: string): string {
  const key = deptNameKeys[name];
  return key ? t(key) : name;
}
function roleLabel(role: string): string {
  const key = roleNameKeys[role];
  return key ? t(key) : role;
}
function blLabel(bl: string): string {
  const key = blNameKeys[bl];
  return key ? t(key) : bl;
}
function roleClass(role: string): string {
  const rc = roleColors[role] ?? { bg: 'bg-gray-100', text: 'text-gray-700' };
  return `${rc.bg} ${rc.text}`;
}
</script>

<template>
  <div class="space-y-6 p-6">
    <div class="flex items-center gap-3">
      <Icon name="permissions" :size="24" color="var(--finrpa-blue)" />
      <h1 class="text-xl font-bold" :style="{ color: 'var(--finrpa-blue)' }">
        {{ t('permissions.title') }}
      </h1>
    </div>

    <div class="grid grid-cols-12 gap-5">
      <!-- Department Tree -->
      <div class="col-span-3">
        <GlassCard :hoverable="false" padding="md">
          <h3
            class="mb-3 flex items-center gap-2 text-sm font-semibold"
            :style="{ color: 'var(--finrpa-text-primary)' }"
          >
            <Icon name="department" :size="16" color="var(--finrpa-blue)" />
            {{ t('permissions.departments') }}
          </h3>
          <div
            class="mb-3 cursor-pointer rounded-md px-2 py-1.5 text-sm hover:bg-gray-50"
            :style="{
              color: !selectedDept ? 'var(--finrpa-blue)' : 'var(--finrpa-text-secondary)',
              fontWeight: !selectedDept ? 600 : 400,
              background: !selectedDept ? 'rgba(26,58,92,0.04)' : undefined,
            }"
            @click="selectedDept = null"
          >
            {{ t('permissions.allDepartments') }}
          </div>
          <DeptTree
            :departments="demoDepartments"
            :selected-id="selectedDept"
            @select="selectedDept = $event"
          />
        </GlassCard>
      </div>

      <!-- User List -->
      <div class="col-span-9">
        <GlassCard :hoverable="false" padding="md">
          <div class="mb-4 flex items-center justify-between">
            <h3
              class="flex items-center gap-2 text-sm font-semibold"
              :style="{ color: 'var(--finrpa-text-primary)' }"
            >
              <Icon name="user" :size="16" color="var(--finrpa-blue)" />
              {{ t('permissions.users') }} ({{ filteredUsers.length }})
            </h3>
            <div class="flex items-center gap-2">
              <div class="relative">
                <Icon
                  name="search"
                  :size="16"
                  color="var(--finrpa-text-muted)"
                  class="absolute left-3 top-1/2 -translate-y-1/2"
                />
                <input
                  class="glass-input pl-9 text-sm"
                  :placeholder="t('permissions.searchUsers')"
                  :style="{ width: '220px' }"
                />
              </div>
            </div>
          </div>

          <table class="glass-table">
            <thead>
              <tr>
                <th>{{ t('permissions.name') }}</th>
                <th>{{ t('permissions.department') }}</th>
                <th>{{ t('permissions.role') }}</th>
                <th>{{ t('permissions.businessLines') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="user in filteredUsers" :key="user.user_id">
                <td class="font-medium">{{ user.name }}</td>
                <td>{{ deptLabel(user.department) }}</td>
                <td>
                  <span class="glass-badge" :class="roleClass(user.role)">
                    {{ roleLabel(user.role) }}
                  </span>
                </td>
                <td>
                  <div class="flex flex-wrap gap-1">
                    <span
                      v-for="bl in user.business_lines"
                      :key="bl"
                      class="rounded-md px-2 py-0.5 text-xs"
                      :style="{
                        background: bl === 'ALL' ? 'var(--finrpa-gold)' : 'rgba(26,58,92,0.06)',
                        color: bl === 'ALL' ? 'white' : 'var(--finrpa-text-secondary)',
                        fontWeight: bl === 'ALL' ? 600 : 400,
                      }"
                    >
                      {{ blLabel(bl) }}
                    </span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </GlassCard>
      </div>
    </div>
  </div>
</template>
