import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json' with { type: 'json' }
import ja from './locales/ja.json' with { type: 'json' }
import zh from './locales/zh.json' with { type: 'json' }

export type Language = 'en' | 'ja' | 'zh'

export const LANGUAGES: { code: Language; label: string; nativeLabel: string }[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'ja', label: 'Japanese', nativeLabel: '日本語' },
  { code: 'zh', label: 'Chinese', nativeLabel: '中文' },
]

function resolveSavedLanguage(): Language {
  if (typeof localStorage === 'undefined') return 'en'

  const savedLanguage = localStorage.getItem('language')
  return isLanguage(savedLanguage) ? savedLanguage : 'en'
}

function isLanguage(value: string | null): value is Language {
  return value === 'en' || value === 'ja' || value === 'zh'
}

const savedLang = resolveSavedLanguage()

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ja: { translation: ja },
      zh: { translation: zh },
    },
    lng: savedLang,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n
