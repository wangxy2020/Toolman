export type MessageStyle = 'concise' | 'default' | 'detailed'
export type ConversationNavButtons = 'hidden' | 'visible'
export type MathEngine = 'katex' | 'mathjax'
export type CodeStyle = 'auto' | 'github' | 'monokai' | 'vs'
export type InputTargetLanguage = 'en' | 'zh'
export type SendShortcut = 'enter' | 'ctrl+enter' | 'shift+enter'

export interface MessageSettings {
  useSerifFont: boolean
  autoCollapseThinking: boolean
  messageStyle: MessageStyle
  conversationNavButtons: ConversationNavButtons
  messageFontSize: number
  mathEngine: MathEngine
  enableInlineDollar: boolean
  codeStyle: CodeStyle
  fancyCodeBlocks: boolean
  codeExecution: boolean
  codeEditor: boolean
  showLineNumbers: boolean
  collapsibleCodeBlocks: boolean
  wrapCodeBlocks: boolean
  enablePreviewTool: boolean
  pasteLongTextAsFile: boolean
  markdownRenderInput: boolean
  quickTranslateWithSpaces: boolean
  showTranslateConfirmDialog: boolean
  enableSlashAtShortcutMenu: boolean
  confirmBeforeDeleteMessage: boolean
  confirmBeforeRegenerateMessage: boolean
  targetLanguage: InputTargetLanguage
  sendShortcut: SendShortcut
}

export const DEFAULT_MESSAGE_SETTINGS: MessageSettings = {
  useSerifFont: false,
  autoCollapseThinking: true,
  messageStyle: 'concise',
  conversationNavButtons: 'hidden',
  messageFontSize: 50,
  mathEngine: 'katex',
  enableInlineDollar: true,
  codeStyle: 'auto',
  fancyCodeBlocks: true,
  codeExecution: false,
  codeEditor: false,
  showLineNumbers: false,
  collapsibleCodeBlocks: false,
  wrapCodeBlocks: false,
  enablePreviewTool: false,
  pasteLongTextAsFile: false,
  markdownRenderInput: false,
  quickTranslateWithSpaces: false,
  showTranslateConfirmDialog: true,
  enableSlashAtShortcutMenu: false,
  confirmBeforeDeleteMessage: true,
  confirmBeforeRegenerateMessage: true,
  targetLanguage: 'en',
  sendShortcut: 'enter',
}

const STORAGE_KEY = 'toolman:message-settings'

export function loadMessageSettings(): MessageSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_MESSAGE_SETTINGS }
    return { ...DEFAULT_MESSAGE_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_MESSAGE_SETTINGS }
  }
}

export function saveMessageSettings(settings: MessageSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export function messageFontSizePx(value: number): number {
  const clamped = Math.min(100, Math.max(0, value))
  return Math.round(12 + (clamped / 100) * 6)
}

export function sendShortcutPlaceholder(sendShortcut: SendShortcut): string {
  if (sendShortcut === 'ctrl+enter') return 'Ctrl + Enter'
  if (sendShortcut === 'shift+enter') return 'Shift + Enter'
  return 'Enter'
}

export const MESSAGE_STYLE_OPTIONS: { value: MessageStyle; label: string }[] = [
  { value: 'concise', label: '简洁' },
  { value: 'default', label: '默认' },
  { value: 'detailed', label: '详细' },
]

export const MATH_ENGINE_OPTIONS: { value: MathEngine; label: string }[] = [
  { value: 'katex', label: 'KaTeX' },
  { value: 'mathjax', label: 'MathJax' },
]

export const CODE_STYLE_OPTIONS: { value: CodeStyle; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'github', label: 'Github Dark' },
  { value: 'monokai', label: 'Monokai' },
  { value: 'vs', label: 'VS Code' },
]

export const TARGET_LANGUAGE_OPTIONS: { value: InputTargetLanguage; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: '中文' },
]

export const SEND_SHORTCUT_OPTIONS: { value: SendShortcut; label: string }[] = [
  { value: 'enter', label: 'Enter' },
  { value: 'ctrl+enter', label: 'Ctrl + Enter' },
  { value: 'shift+enter', label: 'Shift + Enter' },
]
