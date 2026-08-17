<script setup lang="ts">
import { NCard, NGrid, NGi, NStatistic, NText } from 'naive-ui';
import { useAuthStore } from '@/store/auth';

const auth = useAuthStore();
</script>

<template>
  <div>
    <n-text style="font-size: 20px">仪表盘</n-text>
    <n-text depth="3" style="display: block; margin: 8px 0 24px">
      欢迎，{{ auth.user?.displayName ?? auth.user?.username ?? '用户' }}（角色：{{ auth.user?.role ?? '-' }}）
    </n-text>
    <n-grid :cols="4" :x-gap="16">
      <n-gi>
        <n-card><n-statistic label="任务总数" :value="0" /></n-card>
      </n-gi>
      <n-gi>
        <n-card><n-statistic label="待审批" :value="0" /></n-card>
      </n-gi>
      <n-gi>
        <n-card><n-statistic label="执行中" :value="0" /></n-card>
      </n-gi>
      <n-gi>
        <n-card><n-statistic label="成功率" value="—" /></n-card>
      </n-gi>
    </n-grid>
    <n-card title="占位" style="margin-top: 24px">
      <n-text depth="3">Stage 3 起接入真实数据：任务列表、审批中心、审计时间线、ECharts 图表。</n-text>
    </n-card>
  </div>
</template>
