<script setup lang="ts">
// Enterprise 页面外壳：侧边导航 + 顶部语言切换。glass-page 背景对齐源设计 token。
import EnterpriseSideNav from '@/components/enterprise/EnterpriseSideNav.vue';
import LanguageSwitcher from '@/components/enterprise/LanguageSwitcher.vue';
</script>

<template>
  <div class="glass-page flex" style="height: 100vh">
    <aside class="glass-sidebar flex w-64 flex-col" style="margin: 12px 0 12px 12px">
      <div class="flex items-center justify-between px-4 py-4">
        <span class="text-base font-bold" style="color: var(--finrpa-blue)">AgentFlow Studio</span>
        <LanguageSwitcher />
      </div>
      <EnterpriseSideNav />
    </aside>
    <main class="flex-1 overflow-y-auto">
      <RouterView />
    </main>
  </div>
</template>
