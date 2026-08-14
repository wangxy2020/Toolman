import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { AppLanguage } from './language'
import { translate } from './messages'

type I18nValue = {
  language: AppLanguage
  t: (key: string, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider(props: { language: AppLanguage; children: ReactNode }) {
  const value = useMemo<I18nValue>(
    () => ({
      language: props.language,
      t: (key, vars) => translate(props.language, key, vars),
    }),
    [props.language],
  )
  return <I18nContext.Provider value={value}>{props.children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    return {
      language: 'zh-CN',
      t: (key, vars) => translate('zh-CN', key, vars),
    }
  }
  return ctx
}
