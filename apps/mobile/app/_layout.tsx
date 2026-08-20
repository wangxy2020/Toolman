/**
 * Toolman mobile
 * Copyright (C) 2024–2026 Toolman Contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Source: https://github.com/wangxy2020/Toolman
 */
import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { Platform } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { MobileAppRoot } from '../src/state/MobileAppRoot'
import { recordProvenanceBeacon } from '../src/lib/record-provenance-beacon'
import { unlockWebRuntime, bootstrapWebRuntime } from '../src/webRuntimeUnlock'

const WEB_FOCUS_CSS = `
textarea:focus,
input:focus,
[contenteditable]:focus {
  outline: none !important;
  box-shadow: none !important;
}
textarea,
input {
  outline: none !important;
  border: none !important;
  box-shadow: none !important;
  -webkit-appearance: none;
  appearance: none;
}
`

/** Hide scrollbars on every pane; keep scrolling (match desktop module pages). */
const WEB_SCROLLBAR_CSS = `
* {
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
}

*::-webkit-scrollbar {
  width: 0 !important;
  height: 0 !important;
  display: none !important;
}
`

function useWebChromeStyles() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return
    const style = document.createElement('style')
    style.setAttribute('data-toolman-web-chrome', '1')
    style.textContent = `${WEB_FOCUS_CSS}\n${WEB_SCROLLBAR_CSS}`
    document.head.appendChild(style)
    return () => {
      style.remove()
    }
  }, [])
}

export default function RootLayout() {
  useWebChromeStyles()
  useEffect(() => {
    recordProvenanceBeacon('app.start')
  }, [])
  useEffect(() => {
    if (typeof window === 'undefined') return
    bootstrapWebRuntime()
    const onGesture = () => unlockWebRuntime()
    window.addEventListener('pointerdown', onGesture)
    window.addEventListener('keydown', onGesture)
    return () => {
      window.removeEventListener('pointerdown', onGesture)
      window.removeEventListener('keydown', onGesture)
    }
  }, [])
  return (
    <SafeAreaProvider>
      <MobileAppRoot>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false }} />
      </MobileAppRoot>
    </SafeAreaProvider>
  )
}
