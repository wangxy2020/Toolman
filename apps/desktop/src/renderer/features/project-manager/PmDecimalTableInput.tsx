import type { FC, MouseEvent as ReactMouseEvent } from 'react'
import { useLayoutEffect, useRef } from 'react'

/** Normalize locale / IME decimal separators to ASCII `.`. */
export function normalizePmDecimalText(raw: string): string {
  return raw.replace(/[。．，,]/g, '.')
}

/** Empty or intermediate decimal typing such as "", ".", "1.", "-0.". */
export function isPmPartialDecimalText(raw: string): boolean {
  return raw === '' || /^-?\d*(?:\.\d*)?$/.test(raw)
}

/** Parse a decimal field. Empty / placeholder drafts become `null`. */
export function parsePmDecimalInput(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '' || trimmed === '-' || trimmed === '.' || trimmed === '-.') {
    return null
  }
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}

function formatPmDecimalValue(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '' : String(value)
}

type Props = {
  className?: string
  value: number | null
  'aria-label'?: string
  onCommit: (value: number | null) => void
  onClick?: (event: ReactMouseEvent<HTMLInputElement>) => void
}

/**
 * Text decimal cell. While focused the DOM keeps intermediate strings (e.g. "1.");
 * parent number updates must not rewrite the caret text mid-edit.
 */
export const PmDecimalTableInput: FC<Props> = ({
  className,
  value,
  onCommit,
  onClick,
  'aria-label': ariaLabel,
}) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const focusedRef = useRef(false)
  const lastValidRef = useRef(formatPmDecimalValue(value))

  useLayoutEffect(() => {
    if (focusedRef.current) return
    const el = inputRef.current
    if (!el) return
    const next = formatPmDecimalValue(value)
    lastValidRef.current = next
    if (el.value !== next) el.value = next
  }, [value])

  return (
    <input
      ref={inputRef}
      className={className}
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      defaultValue={formatPmDecimalValue(value)}
      onFocus={() => {
        focusedRef.current = true
        lastValidRef.current = inputRef.current?.value ?? formatPmDecimalValue(value)
      }}
      onChange={(event) => {
        const el = event.currentTarget
        const normalized = normalizePmDecimalText(el.value)
        if (!isPmPartialDecimalText(normalized)) {
          el.value = lastValidRef.current
          return
        }
        if (el.value !== normalized) {
          const caret = el.selectionStart ?? normalized.length
          el.value = normalized
          const nextCaret = Math.min(caret, normalized.length)
          el.setSelectionRange(nextCaret, nextCaret)
        }
        lastValidRef.current = normalized
        onCommit(parsePmDecimalInput(normalized))
      }}
      onBlur={() => {
        focusedRef.current = false
        const parsed = parsePmDecimalInput(inputRef.current?.value ?? '')
        onCommit(parsed)
        const next = formatPmDecimalValue(parsed)
        lastValidRef.current = next
        if (inputRef.current) inputRef.current.value = next
      }}
      onClick={onClick}
    />
  )
}
