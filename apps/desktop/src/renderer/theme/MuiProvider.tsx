import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ThemeProvider } from '@mui/material/styles'

import { createAppMuiTheme } from './mui-theme'

function readThemeMode(): 'light' | 'dark' {
  return document.documentElement.classList.contains('theme-dark') ? 'dark' : 'light'
}

export function MuiProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState(readThemeMode)

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setMode(readThemeMode())
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    return () => observer.disconnect()
  }, [])

  const theme = useMemo(() => createAppMuiTheme(mode), [mode])

  return <ThemeProvider theme={theme}>{children}</ThemeProvider>
}
