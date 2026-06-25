import { useContext } from 'react'
import { I18nContext, type I18nContextValue } from './I18nProvider'
import { translate } from './translate'

const fallback: I18nContextValue = {
  language: 'zh-CN',
  t: (key, params) => translate('zh-CN', key, params),
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext) ?? fallback
}

export type { I18nContextValue, TranslateFn } from './I18nProvider'
