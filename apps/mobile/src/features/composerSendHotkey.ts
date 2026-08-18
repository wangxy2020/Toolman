/**
 * Toolman — Copyright (C) 2024–2026 Toolman Contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Source: https://github.com/wangxy2020/Toolman
 */
export function isMacComposerHost(
  platform = typeof navigator === 'undefined' ? '' : navigator.platform || navigator.userAgent,
): boolean {
  return /Mac|iPhone|iPad/i.test(platform)
}

/** Web send: ⌘Enter on Mac, Alt+Enter (or Ctrl+Enter) on Windows/Linux. Enter inserts a newline. */
export function isWebComposerSendHotkey(
  event: {
    key: string
    metaKey?: boolean
    altKey?: boolean
    ctrlKey?: boolean
    shiftKey?: boolean
  },
  macHost = isMacComposerHost(),
): boolean {
  if (event.key !== 'Enter' || event.shiftKey) return false
  if (macHost) return Boolean(event.metaKey)
  return Boolean(event.altKey || event.ctrlKey)
}

export function webComposerSendPlaceholder(isGroup: boolean): string {
  const prefix = isGroup ? '输入群组消息' : '输入消息'
  if (isMacComposerHost()) return `${prefix}，⌘Enter 发送，Enter 换行…`
  return `${prefix}，Alt+Enter 发送，Enter 换行…`
}
