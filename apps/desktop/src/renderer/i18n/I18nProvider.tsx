import { createContext, useEffect, useMemo, type ReactNode } from 'react'
import type { AppLanguage } from '../features/settings/app-settings'
import { getDateLocale } from './date-locale'
import { translate, type TranslateParams } from './translate'

export type TranslateFn = (key: string, params?: TranslateParams) => string

export interface I18nContextValue {
  language: AppLanguage
  t: TranslateFn
}

export const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({
  language,
  children,
}: {
  language: AppLanguage
  children: ReactNode
}) {
  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      t: (key, params) => translate(language, key, params),
    }),
    [language],
  )

  // Keep <html lang> in sync so native controls (e.g. input[type=date]) use the UI locale.
  useEffect(() => {
    document.documentElement.lang = getDateLocale(language)
  }, [language])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
