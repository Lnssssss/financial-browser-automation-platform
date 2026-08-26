<script setup lang="ts">
// Enterprise 审批中心。真实 API 优先，失败降级演示数据；approve/reject 同样降级（demo 模式下仅本地移除）。
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import GlassCard from '@/components/enterprise/GlassCard.vue';
import Icon from '@/components/icons/Icon.vue';
import * as api from '@/api/enterprise';
import type { ApprovalRequest } from '@/api/enterprise';
import ApprovalCard from './ApprovalCard.vue';
import { demoApprovals } from './demoData';

const { t } = useI18n();
const approvals = ref<ApprovalRequest[]>([]);

onMounted(async () => {
  try {
    approvals.value = await api.listPendingApprovals();
  } catch {
    approvals.value = demoApprovals();
  }
});

async function handleApprove(id: string) {
  try {
    await api.approveRequest(id);
  } catch {
    // demo 模式：接口不可用时仅本地移除
  }
  approvals.value = approvals.value.filter((a) => a.id !== id);
}

async function handleReject(id: string) {
  try {
    await api.rejectRequest(id);
  } catch {
    // demo 模式：接口不可用时仅本地移除
  }
  approvals.value = approvals.value.filter((a) => a.id !== id);
}
</script>

<template>
  <div class="space-y-6 p-6">
    <div class="flex items-center gap-3">
      <Icon name="approval" :size="24" color="var(--finrpa-blue)" />
      <h1 class="text-xl font-bold" style="color: var(--finrpa-blue)">{{ t('approvals.title') }}</h1>
      <span class="ml-2 rounded-full px-2.5 py-0.5 text-xs font-bold" style="background: var(--finrpa-gold); color: white">
        {{ approvals.length }}
      </span>
    </div>

    <GlassCard v-if="approvals.length === 0" :hoverable="false" padding="lg">
      <div class="flex flex-col items-center justify-center py-12">
        <Icon name="check-circle" :size="48" color="var(--status-completed)" />
        <p class="mt-4 text-sm font-medium" style="color: var(--finrpa-text-secondary)">{{ t('approvals.allCaughtUp') }}</p>
      </div>
    </GlassCard>

    <ApprovalCard
      v-for="item in approvals"
      :key="item.id"
      :item="item"
      @approve="handleApprove"
      @reject="handleReject"
    />
  </div>
</template>
