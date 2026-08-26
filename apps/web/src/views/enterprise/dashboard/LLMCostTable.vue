<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { LLMCostRow } from './demoData';

const props = defineProps<{ data: LLMCostRow[] }>();
const { t } = useI18n();

const tierKeys: Record<string, string> = {
  Light: 'dashboard.modelLight',
  Standard: 'dashboard.modelStandard',
  Heavy: 'dashboard.modelHeavy',
};
const tierColors: Record<string, string> = {
  Light: 'var(--status-completed)',
  Standard: 'var(--finrpa-blue)',
  Heavy: 'var(--status-needs-human)',
};

const totalCalls = computed(() => props.data.reduce((s, r) => s + r.calls, 0));
const totalHits = computed(() => props.data.reduce((s, r) => s + r.cache_hits, 0));
const totalCost = computed(() => props.data.reduce((s, r) => s + r.cost_usd, 0));
const hitRate = computed(() => (totalCalls.value > 0 ? ((totalHits.value / totalCalls.value) * 100).toFixed(1) : '0'));
</script>

<template>
  <div>
    <table class="w-full text-sm">
      <thead>
        <tr style="border-bottom: 1px solid var(--glass-border)">
          <th class="pb-3 text-left font-medium" style="color: var(--finrpa-text-muted)">{{ t('dashboard.modelTier') }}</th>
          <th class="pb-3 text-right font-medium" style="color: var(--finrpa-text-muted)">{{ t('dashboard.calls') }}</th>
          <th class="pb-3 text-right font-medium" style="color: var(--finrpa-text-muted)">{{ t('dashboard.cacheHits') }}</th>
          <th class="pb-3 text-right font-medium" style="color: var(--finrpa-text-muted)">{{ t('dashboard.cost') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in data" :key="row.tier" style="border-bottom: 1px solid var(--glass-border)">
          <td class="py-3">
            <span class="inline-flex items-center gap-2">
              <span class="h-2 w-2 rounded-full" :style="{ background: tierColors[row.tier] }" />
              <span style="color: var(--finrpa-text-primary)">{{ tierKeys[row.tier] ? t(tierKeys[row.tier]) : row.tier }}</span>
            </span>
          </td>
          <td class="py-3 text-right" style="color: var(--finrpa-text-secondary)">{{ row.calls.toLocaleString() }}</td>
          <td class="py-3 text-right" style="color: var(--finrpa-text-secondary)">{{ row.cache_hits.toLocaleString() }}</td>
          <td class="py-3 text-right font-medium" style="color: var(--finrpa-text-primary)">${{ row.cost_usd.toFixed(2) }}</td>
        </tr>
      </tbody>
    </table>
    <div class="mt-4 flex items-center justify-between rounded-lg px-3 py-2" style="background: rgba(26,58,92,0.04)">
      <div class="flex items-center gap-4">
        <span class="text-xs" style="color: var(--finrpa-text-muted)">
          {{ t('dashboard.totalCost') }}: <strong style="color: var(--finrpa-text-primary)">${{ totalCost.toFixed(2) }}</strong>
        </span>
        <span class="text-xs" style="color: var(--finrpa-text-muted)">
          {{ t('dashboard.cacheHitRate') }}: <strong style="color: var(--status-completed)">{{ hitRate }}%</strong>
        </span>
      </div>
      <span class="text-xs" style="color: var(--finrpa-text-muted)">{{ t('dashboard.calls') }}: {{ totalCalls.toLocaleString() }}</span>
    </div>
  </div>
</template>
