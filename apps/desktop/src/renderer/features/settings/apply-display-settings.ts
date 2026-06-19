import type { AppSettings } from './app-settings'

function resolveTheme(theme: AppSettings['theme']): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null
  const num = Number.parseInt(normalized, 16)
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  }
}

export function applyDisplaySettings(settings: AppSettings): void {
  const root = document.documentElement
  const resolved = resolveTheme(settings.theme)

  root.classList.remove('theme-light', 'theme-dark')
  root.classList.add(resolved === 'dark' ? 'theme-dark' : 'theme-light')
  root.dataset.theme = settings.theme
  root.dataset.navPosition = settings.navBarPosition
  root.dataset.transparentWindow = settings.transparentWindow ? 'true' : 'false'

  root.style.setProperty('--tm-accent', settings.themeColor)

  const rgb = hexToRgb(settings.themeColor)
  if (rgb) {
    root.style.setProperty('--tm-accent-rgb', `${rgb.r} ${rgb.g} ${rgb.b}`)
    root.style.setProperty('--tm-accent-light', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.12)`)
    root.style.setProperty('--tm-accent-hover', settings.themeColor)
  }

  root.style.zoom = `${settings.zoomLevel}%`

  root.classList.remove('tm-font-serif', 'tm-font-mono')
  if (settings.fontFamily === 'serif') root.classList.add('tm-font-serif')
  if (settings.fontFamily === 'mono') root.classList.add('tm-font-mono')
}

export function watchSystemTheme(onChange: () => void): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = () => onChange()
  media.addEventListener('change', handler)
  return () => media.removeEventListener('change', handler)
}
