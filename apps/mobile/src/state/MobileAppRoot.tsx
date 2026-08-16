import type { ReactNode } from 'react'
import { I18nProvider } from '../i18n'
import { MobileAppProvider } from './MobileAppContext'
import { useMobileAppRootState } from './useMobileAppRootState'

export function MobileAppRoot({ children }: { children: ReactNode }) {
  const { ready, modulePrefs, value } = useMobileAppRootState()

  if (!ready) return null
  return (
    <I18nProvider language={modulePrefs.app.language}>
      <MobileAppProvider value={value}>{children}</MobileAppProvider>
    </I18nProvider>
  )
}
