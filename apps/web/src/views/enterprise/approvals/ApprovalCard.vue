<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import GlassCard from '@/components/enterprise/GlassCard.vue';
import RiskBadge from '@/components/enterprise/RiskBadge.vue';
import Icon from '@/components/icons/Icon.vue';
import type { ApprovalRequest } from '@/api/enterprise';

defineProps<{ item: ApprovalRequest }>();
const emit = defineEmits<{ approve: [id: string]; reject: [id: string] }>();

const { t } = useI18n();
const remark = ref('');

const DEPT_NAMES: Record<string, string> = {
  dept_corp_credit: '对公信贷部',
  dept_personal_fin: '个人金融部',
  dept_asset_mgmt: '资产管理部',
  dept_risk_mgmt: '风险管理部',
  dept_compliance: '合规审计部',
  dept_it: '信息技术部',
};
const BL_NAMES: Record<string, string> = {
  bl_corp_loan: '对公贷款',
  bl_retail_credit: '零售信贷',
  bl_wealth_mgmt: '财富管理',
  bl_intl_settle: '国际结算',
};
</script>

<template>
  <GlassCard :hoverable="false" padding="md" class="mb-4">
    <div class="flex gap-6">
      <div class="hidden w-48 shrink-0 sm:block">
        <div class="flex h-32 w-full items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50">
          <span class="text-xs text-gray-400">{{ t('approvals.noScreenshot') }}</span>
        </div>
      </div>

      <div class="flex-1">
        <div class="mb-2 flex items-center gap-3">
          <RiskBadge :level="item.riskLevel" />
          <span class="text-xs" style="color: var(--finrpa-text-muted)">
            {{ DEPT_NAMES[item.departmentId] ?? item.departmentId }}
            <template v-if="item.businessLineId"> / {{ BL_NAMES[item.businessLineId] ?? item.businessLineId }}</template>
          </span>
        </div>

        <h3 class="text-sm font-semibold" style="color: var(--finrpa-text-primary)">
          {{ item.operationDescription ?? item.taskId }}
        </h3>

        <p class="mt-1 text-sm" style="color: var(--finrpa-text-secondary)">{{ item.riskReason }}</p>

        <div class="mt-2 flex items-center gap-4 text-xs" style="color: var(--finrpa-text-muted)">
          <span>{{ t('approvals.task') }}: {{ item.taskId }}</span>
          <span>{{ t('approvals.requested') }}: {{ new Date(item.requestedAt).toLocaleString() }}</span>
        </div>
      </div>

      <div class="flex shrink-0 flex-col gap-2" style="width: 180px">
        <input
          v-model="remark"
          class="glass-input text-xs"
          :placeholder="t('approvals.remarkPlaceholder')"
        />
        <button class="glass-btn-primary flex items-center justify-center gap-1 text-sm" @click="emit('approve', item.id)">
          <Icon name="check-circle" :size="16" color="white" />
          {{ t('approvals.approve') }}
        </button>
        <button
          class="flex items-center justify-center gap-1 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
          @click="emit('reject', item.id)"
        >
          <Icon name="x-circle" :size="16" color="#DC2626" />
          {{ t('approvals.reject') }}
        </button>
      </div>
    </div>
  </GlassCard>
</template>
