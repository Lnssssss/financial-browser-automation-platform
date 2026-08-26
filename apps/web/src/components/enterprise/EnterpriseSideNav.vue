<script setup lang="ts">
// Enterprise 侧边导航。源码含 build/general 分区（discover/tasks/workflows 等），
// 但那些路由不在本次迁移范围内（新项目暂无对应页面）——按存在的页面收窄为 enterprise 分区。
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import Icon from '@/components/icons/Icon.vue';
import type { IconName } from '@/components/icons/iconPaths';
import { useAuthStore } from '@/store/auth';

type NavItem = { labelKey: string; to: string; icon: IconName };

const enterpriseSection: NavItem[] = [
  { labelKey: 'nav.dashboard', to: '/enterprise/dashboard', icon: 'dashboard' },
  { labelKey: 'nav.approvals', to: '/enterprise/approvals', icon: 'approval' },
  { labelKey: 'nav.auditLogs', to: '/enterprise/audit', icon: 'audit' },
  { labelKey: 'nav.permissions', to: '/enterprise/permissions', icon: 'permissions' },
  { labelKey: 'nav.llmMonitor', to: '/enterprise/llm', icon: 'workflow' },
];

const { t } = useI18n();
const router = useRouter();
const auth = useAuthStore();

function handleLogout() {
  auth.logout();
  router.push('/login');
}
</script>

<template>
  <nav class="flex-1 overflow-y-auto py-2">
    <div class="mb-6">
      <div class="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest" style="color: var(--finrpa-text-muted)">
        {{ t('nav.enterprise') }}
      </div>
      <div class="space-y-1">
        <RouterLink
          v-for="item in enterpriseSection"
          :key="item.to"
          :to="item.to"
          class="glass-nav-item"
          active-class="active"
        >
          <Icon :name="item.icon" :size="20" />
          <span>{{ t(item.labelKey) }}</span>
        </RouterLink>
      </div>
    </div>

    <div class="mt-2 border-t" style="border-color: var(--glass-border)">
      <button
        type="button"
        class="glass-nav-item w-full"
        style="cursor: pointer; background: none; border: none"
        @click="handleLogout"
      >
        <Icon name="logout" :size="20" />
        <span>{{ t('auth.logout') }}</span>
      </button>
    </div>
  </nav>
</template>
