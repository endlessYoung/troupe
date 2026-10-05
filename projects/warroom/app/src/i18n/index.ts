import en from './en.json';
import zh from './zh-CN.json';

export type Locale = 'en' | 'zh-CN';

const catalogs: Record<Locale, Record<string, string>> = {
  en,
  'zh-CN': zh,
};

export class I18n {
  locale: Locale;
  private readonly listeners = new Set<() => void>();

  constructor() {
    const language = navigator.language.toLowerCase();
    this.locale = language.startsWith('zh') ? 'zh-CN' : 'en';
  }

  t(key: string, vars?: Record<string, string | number>): string {
    const primary = catalogs[this.locale]?.[key];
    const fallback = catalogs.en[key];
    let text = primary ?? fallback ?? key;
    if (vars) {
      for (const [name, value] of Object.entries(vars)) {
        text = text.replaceAll(`{${name}}`, String(value));
      }
    }
    return text;
  }

  setLocale(locale: Locale): void {
    if (this.locale === locale) return;
    this.locale = locale;
    for (const listener of this.listeners) listener();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
