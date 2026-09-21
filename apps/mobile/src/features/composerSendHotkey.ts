/**
 * Toolman — Copyright (C) 2024–2026 Toolman Contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Source: https://github.com/wangxy2020/Toolman
 */

type ComposerKeyEvent = {
  key?: string
  keyCode?: number
  which?: number
  metaKey?: boolean
  altKey?: boolean
  ctrlKey?: boolean
  shiftKey?: boolean
  nativeEvent?: ComposerKeyEvent
  getModifierState?: (key: string) => boolean
}

function readFlag(
  event: ComposerKeyEvent,
  native: ComposerKeyEvent | undefined,
  key: 'metaKey' | 'altKey' | 'ctrlKey' | 'shiftKey',
  modifier: string,
): boolean {
  return Boolean(
    event[key] ||
      native?.[key] ||
      event.getModifierState?.(modifier) ||
      native?.getModifierState?.(modifier),
  )
}

export function isMacComposerHost(
  platform = typeof navigator === 'undefined'
    ? ''
    : [
        (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
          ?.platform,
        navigator.platform,
        navigator.userAgent,
      ]
        .filter(Boolean)
        .join(' '),
): boolean {
  return /Mac|iPhone|iPad|Macintosh|iOS/i.test(platform)
}

export function isComposerEnterKey(event: ComposerKeyEvent): boolean {
  const native = event.nativeEvent
  const key = String(native?.key ?? event.key ?? '')
  if (key === 'Enter' || key === 'NumpadEnter') return true
  const code = native?.keyCode ?? event.keyCode ?? native?.which ?? event.which
  return code === 13
}

/** Web send: ⌘Enter on Mac, Alt+Enter (or Ctrl+Enter) on Windows/Linux. Enter inserts a newline. */
export function isWebComposerSendHotkey(
  event: ComposerKeyEvent,
  macHost = isMacComposerHost(),
): boolean {
  const native = event.nativeEvent
  if (!isComposerEnterKey(event) || readFlag(event, native, 'shiftKey', 'Shift')) return false
  if (macHost) return readFlag(event, native, 'metaKey', 'Meta')
  return readFlag(event, native, 'altKey', 'Alt') || readFlag(event, native, 'ctrlKey', 'Control')
}

export function webComposerSendPlaceholder(isGroup: boolean): string {
  const prefix = isGroup ? '输入群组消息' : '输入消息'
  if (isMacComposerHost()) return `${prefix}，⌘Enter 发送，Enter 换行…`
  return `${prefix}，Alt+Enter 发送，Enter 换行…`
}
