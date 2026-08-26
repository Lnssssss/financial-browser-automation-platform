import { createI18n } from 'vue-i18n';
import { en } from './locales/en';
import { zh } from './locales/zh';

export type Locale = 'zh' | 'en';

const STORAGE_KEY = 'agentflow-locale';

function initialLocale(): Locale {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === 'en' ? 'en' : 'zh';
}

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: 'zh',
  messages: { zh, en },
});

/// 切换语言并持久化，供 LanguageSwitcher 调用。
export function setLocale(locale: Locale) {
  i18n.global.locale.value = locale;
  localStorage.setItem(STORAGE_KEY, locale);
}
