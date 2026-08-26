<script setup lang="ts">
// Enterprise Dashboard — 运营数据总览。真实 API 优先，失败降级演示数据（对齐源码策略）。
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import GlassCard from '@/components/enterprise/GlassCard.vue';
import Icon from '@/components/icons/Icon.vue';
import * as api from '@/api/enterprise';
import OverviewCards from './OverviewCards.vue';
import TrendChart from './TrendChart.vue';
import ErrorPieChart from './ErrorPieChart.vue';
import BLBarChart from './BLBarChart.vue';
import ApprovalResponseChart from './ApprovalResponseChart.vue';
import LLMCostTable from './LLMCostTable.vue';
import RecentTasksTable from './RecentTasksTable.vue';
import {
  demoOverview, demoTrend, demoErrors, demoBL, demoApprovalHours, demoLLMCost, demoRecentTasks,
  type OverviewData, type TrendItem, type ErrorDistribution, type BLComparison,
  type ApprovalHour, type LLMCostRow, type RecentTask,
} from './demoData';

const { t } = useI18n();

const overview = ref<OverviewData | null>(null);
const trend = ref<TrendItem[]>([]);
const errors = ref<ErrorDistribution>({});
const blData = ref<BLComparison[]>([]);
const approvalHours = ref<ApprovalHour[]>([]);
const llmCost = ref<LLMCostRow[]>([]);
const recentTasks = ref<RecentTask[]>([]);

onMounted(async () => {
  try {
    const [ov, tr, er, bl] = await Promise.all([
      api.getOverview(), api.getTrend(30), api.getErrors(), api.getBusinessLines(),
    ]);
    overview.value = ov ?? demoOverview();
    trend.value = tr ?? demoTrend();
    errors.value = er ?? demoErrors();
    blData.value = bl ?? demoBL();
  } catch {
    overview.value = demoOverview();
    trend.value = demoTrend();
    errors.value = demoErrors();
    blData.value = demoBL();
  }

  try {
    const [ah, cost] = await Promise.all([api.getApprovalTime(), api.getCost()]);
    approvalHours.value = ah ?? demoApprovalHours();
    if (cost?.breakdown) {
      llmCost.value = cost.breakdown.map((b) => ({
        tier: b.model_tier.charAt(0).toUpperCase() + b.model_tier.slice(1).toLowerCase(),
        calls: b.total_calls,
        cache_hits: b.cached_calls,
        cost_usd: b.estimated_cost_usd,
      }));
    } else {
      llmCost.value = demoLLMCost();
    }
  } catch {
    approvalHours.value = demoApprovalHours();
    llmCost.value = demoLLMCost();
  }

  recentTasks.value = demoRecentTasks();
});
</script>

<template>
  <div v-if="overview" class="space-y-6 p-6">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <Icon name="dashboard" :size="24" color="var(--finrpa-blue)" />
        <h1 class="text-xl font-bold" style="color: var(--finrpa-blue)">{{ t('dashboard.title') }}</h1>
      </div>
      <div class="flex items-center gap-3">
        <span class="rounded-full px-3 py-1 text-xs font-medium" style="background: rgba(16,185,129,0.1); color: var(--status-completed)">
          {{ t('dashboard.successRate7d') }}: {{ overview.success_rate_7d }}%
        </span>
        <span class="rounded-full px-3 py-1 text-xs font-medium" style="background: rgba(26,58,92,0.06); color: var(--finrpa-blue)">
          {{ t('dashboard.avgDuration') }}: {{ (overview.avg_duration_ms / 1000).toFixed(1) }}{{ t('dashboard.seconds') }}
        </span>
        <button class="glass-btn-secondary flex items-center gap-2 text-sm">
          <Icon name="download" :size="16" />
          {{ t('dashboard.exportCsv') }}
        </button>
      </div>
    </div>

    <OverviewCards :data="overview" />

    <div class="grid grid-cols-1 gap-5 xl:grid-cols-3">
      <GlassCard :hoverable="false" padding="md" class="xl:col-span-2">
        <h3 class="mb-4 text-sm font-semibold" style="color: var(--finrpa-text-primary)">{{ t('dashboard.taskTrend30') }}</h3>
        <TrendChart :data="trend" />
      </GlassCard>
      <GlassCard :hoverable="false" padding="md">
        <h3 class="mb-4 text-sm font-semibold" style="color: var(--finrpa-text-primary)">{{ t('dashboard.errorDistribution') }}</h3>
        <ErrorPieChart :data="errors" />
      </GlassCard>
    </div>

    <div class="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <GlassCard :hoverable="false" padding="md">
        <h3 class="mb-4 text-sm font-semibold" style="color: var(--finrpa-text-primary)">
          {{ t('dashboard.businessLineComparison') }} — {{ t('dashboard.successRateLabel') }}
        </h3>
        <BLBarChart :data="blData" />
      </GlassCard>
      <GlassCard :hoverable="false" padding="md">
        <h3 class="mb-4 text-sm font-semibold" style="color: var(--finrpa-text-primary)">{{ t('dashboard.approvalResponseTime') }}</h3>
        <ApprovalResponseChart :data="approvalHours" />
      </GlassCard>
    </div>

    <div class="grid grid-cols-1 gap-5 xl:grid-cols-3">
      <GlassCard :hoverable="false" padding="md">
        <h3 class="mb-4 text-sm font-semibold" style="color: var(--finrpa-text-primary)">{{ t('dashboard.llmCostAnalysis') }}</h3>
        <LLMCostTable :data="llmCost" />
      </GlassCard>
      <GlassCard :hoverable="false" padding="md" class="xl:col-span-2">
        <h3 class="mb-4 text-sm font-semibold" style="color: var(--finrpa-text-primary)">{{ t('dashboard.recentTasks') }}</h3>
        <RecentTasksTable :data="recentTasks" />
      </GlassCard>
    </div>
  </div>
</template>
