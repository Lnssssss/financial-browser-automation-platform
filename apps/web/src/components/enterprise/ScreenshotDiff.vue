<script setup lang="ts">
// 审计日志前后截图对比：左右并排 + 点击放大浮层。
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  beforeUrl?: string | null;
  afterUrl?: string | null;
  beforeLabel?: string;
  afterLabel?: string;
}>();

const { t } = useI18n();
const resolvedBeforeLabel = props.beforeLabel ?? t('common.before');
const resolvedAfterLabel = props.afterLabel ?? t('common.after');

const zoomedImage = ref<string | null>(null);
</script>

<template>
  <div class="grid grid-cols-2 gap-4">
    <div>
      <div class="mb-2 text-xs font-semibold uppercase tracking-wider" style="color: var(--finrpa-text-muted)">
        {{ resolvedBeforeLabel }}
      </div>
      <div
        v-if="beforeUrl"
        class="cursor-pointer overflow-hidden rounded-lg border border-gray-200 transition-shadow hover:shadow-md"
        @click="zoomedImage = beforeUrl!"
      >
        <img :src="beforeUrl" :alt="resolvedBeforeLabel" class="h-auto w-full object-contain" />
      </div>
      <div v-else class="flex h-40 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50">
        <span class="text-sm text-gray-400">No screenshot</span>
      </div>
    </div>

    <div>
      <div class="mb-2 text-xs font-semibold uppercase tracking-wider" style="color: var(--finrpa-text-muted)">
        {{ resolvedAfterLabel }}
      </div>
      <div
        v-if="afterUrl"
        class="cursor-pointer overflow-hidden rounded-lg border border-gray-200 transition-shadow hover:shadow-md"
        @click="zoomedImage = afterUrl!"
      >
        <img :src="afterUrl" :alt="resolvedAfterLabel" class="h-auto w-full object-contain" />
      </div>
      <div v-else class="flex h-40 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50">
        <span class="text-sm text-gray-400">No screenshot</span>
      </div>
    </div>
  </div>

  <div
    v-if="zoomedImage"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    @click="zoomedImage = null"
  >
    <img :src="zoomedImage" alt="Zoomed screenshot" class="max-h-[90vh] max-w-[90vw] rounded-lg shadow-2xl" />
  </div>
</template>
