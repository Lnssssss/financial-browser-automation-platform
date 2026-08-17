<script setup lang="ts">
import { NConfigProvider, NMessageProvider, zhCN, dateZhCN } from 'naive-ui';
import { RouterView } from 'vue-router';
</script>

<template>
  <n-config-provider :locale="zhCN" :date-locale="dateZhCN">
    <n-message-provider>
      <router-view />
    </n-message-provider>
  </n-config-provider>
</template>
