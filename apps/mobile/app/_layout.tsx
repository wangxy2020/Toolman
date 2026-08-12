import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { Platform } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { MobileAppRoot } from '../src/state/MobileAppRoot'

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

/** Match desktop `theme.css` unified scrollbars (agent stream + other panes). */
const WEB_SCROLLBAR_CSS = `
:root {
  --tm-text-secondary: #8b8f96;
  --tm-text-muted: #b0b4bb;
  --tm-scrollbar-track: transparent;
  --tm-scrollbar-thumb: color-mix(in srgb, var(--tm-text-muted) 50%, transparent);
  --tm-scrollbar-thumb-hover: color-mix(in srgb, var(--tm-text-secondary) 70%, transparent);
}

* {
  scrollbar-width: thin;
  scrollbar-color: var(--tm-scrollbar-thumb) var(--tm-scrollbar-track);
}

*::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

*::-webkit-scrollbar-track {
  background: var(--tm-scrollbar-track);
}

*::-webkit-scrollbar-thumb {
  background: var(--tm-scrollbar-thumb);
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}

*::-webkit-scrollbar-thumb:hover {
  background: var(--tm-scrollbar-thumb-hover);
  border: 2px solid transparent;
  background-clip: padding-box;
}

*::-webkit-scrollbar-corner {
  background: var(--tm-scrollbar-track);
}

/* Agent message stream: keep scroll, hide the vertical scrollbar. */
.tm-agent-stream-scroll,
.tm-agent-stream-scroll div {
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
}
.tm-agent-stream-scroll::-webkit-scrollbar,
.tm-agent-stream-scroll div::-webkit-scrollbar {
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
  return (
    <SafeAreaProvider>
      <MobileAppRoot>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false }} />
      </MobileAppRoot>
    </SafeAreaProvider>
  )
}
