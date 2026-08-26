<script setup lang="ts">
// 中英切换按钮，复用 i18n/setLocale。
import { useI18n } from 'vue-i18n';
import { setLocale, type Locale } from '@/i18n';

const { locale } = useI18n();

function toggleLocale() {
  setLocale((locale.value === 'zh' ? 'en' : 'zh') as Locale);
}
</script>

<template>
  <button
    class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-white/10"
    style="color: var(--finrpa-text-secondary, #64748b)"
    :title="locale === 'zh' ? 'Switch to English' : '切换为中文'"
    @click="toggleLocale"
  >
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.4" />
      <ellipse cx="8" cy="8" rx="3.5" ry="7" stroke="currentColor" stroke-width="1.2" />
      <line x1="1" y1="8" x2="15" y2="8" stroke="currentColor" stroke-width="1.2" />
      <line x1="3" y1="3.5" x2="13" y2="3.5" stroke="currentColor" stroke-width="0.8" />
      <line x1="3" y1="12.5" x2="13" y2="12.5" stroke="currentColor" stroke-width="0.8" />
    </svg>
    <span>{{ locale === 'zh' ? '中文' : 'EN' }}</span>
  </button>
</template>
