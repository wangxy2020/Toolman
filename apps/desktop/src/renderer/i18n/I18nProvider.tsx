import { createContext, useMemo, type ReactNode } from 'react'
import type { AppLanguage } from '../features/settings/app-settings'
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

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
