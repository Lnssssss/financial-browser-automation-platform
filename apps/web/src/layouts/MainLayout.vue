<script setup lang="ts">
import { NLayout, NLayoutHeader, NLayoutSider, NLayoutContent, NMenu, NButton, NSpace, NText } from 'naive-ui';
import { h } from 'vue';
import { RouterView, useRouter, RouterLink } from 'vue-router';
import { useAuthStore } from '@/store/auth';

const auth = useAuthStore();
const router = useRouter();

const menuOptions = [
  {
    label: () => h(RouterLink, { to: '/' }, { default: () => '仪表盘' }),
    key: 'dashboard',
  },
];

function handleLogout() {
  auth.logout();
  router.push({ name: 'login' });
}
</script>

<template>
  <n-layout style="height: 100vh">
    <n-layout-header bordered style="height: 56px; padding: 0 24px; display: flex; align-items: center; justify-content: space-between">
      <n-text strong style="font-size: 18px">AgentFlow Studio</n-text>
      <n-space align="center">
        <n-text depth="3">{{ auth.user?.displayName ?? '未登录' }}</n-text>
        <n-button size="small" @click="handleLogout">登出</n-button>
      </n-space>
    </n-layout-header>
    <n-layout has-sider style="height: calc(100vh - 56px)">
      <n-layout-sider bordered width="200" content-style="padding: 12px">
        <n-menu :options="menuOptions" />
      </n-layout-sider>
      <n-layout-content content-style="padding: 24px">
        <router-view />
      </n-layout-content>
    </n-layout>
  </n-layout>
</template>
