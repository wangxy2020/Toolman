import type { FC, MouseEvent as ReactMouseEvent } from 'react'
import { useLayoutEffect, useRef } from 'react'

const THOUSAND_SEP_DECIMAL =
  /^-?\d{1,3}(?:,\d{3})+(?:\.\d*)?$/
const THOUSAND_SEP_INTEGER = /^-?\d{1,3}(?:,\d{3})+$/

/** Normalize locale / IME decimal separators; strip thousand separators when present. */
export function normalizePmDecimalText(raw: string): string {
  const withAsciiDecimal = raw.replace(/[。．]/g, '.')
  const trimmed = withAsciiDecimal.trim()
  if (THOUSAND_SEP_DECIMAL.test(trimmed) || THOUSAND_SEP_INTEGER.test(trimmed)) {
    return withAsciiDecimal.replace(/,/g, '')
  }
  // Single comma without thousand grouping → treat as decimal (e.g. European "1,5").
  return withAsciiDecimal.replace(/,/g, '.')
}

/** Empty or intermediate decimal typing such as "", ".", "1.", "-0.". */
export function isPmPartialDecimalText(raw: string): boolean {
  return raw === '' || /^-?\d*(?:\.\d*)?$/.test(raw)
}

/** Parse a decimal field. Empty / placeholder drafts become `null`. */
export function parsePmDecimalInput(raw: string): number | null {
  const normalized = normalizePmDecimalText(raw).trim()
  if (
    normalized === '' ||
    normalized === '-' ||
    normalized === '.' ||
    normalized === '-.'
  ) {
    return null
  }
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

/** Plain numeric text for focused editing (no thousand separators). */
export function formatPmDecimalPlain(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '' : String(value)
}

/** Display text with thousand separators when |value| ≥ 1000. */
export function formatPmDecimalDisplay(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return ''
  return value.toLocaleString('zh-CN', {
    maximumFractionDigits: 20,
    useGrouping: Math.abs(value) >= 1000,
  })
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
 * When blurred, values ≥ 1000 show thousand separators.
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
  const lastValidRef = useRef(formatPmDecimalPlain(value))

  useLayoutEffect(() => {
    if (focusedRef.current) return
    const el = inputRef.current
    if (!el) return
    const next = formatPmDecimalDisplay(value)
    lastValidRef.current = formatPmDecimalPlain(value)
    if (el.value !== next) el.value = next
  }, [value])

  return (
    <input
      ref={inputRef}
      className={className}
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      defaultValue={formatPmDecimalDisplay(value)}
      onFocus={() => {
        focusedRef.current = true
        const plain = formatPmDecimalPlain(value)
        lastValidRef.current = plain
        if (inputRef.current) inputRef.current.value = plain
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
        lastValidRef.current = formatPmDecimalPlain(parsed)
        if (inputRef.current) inputRef.current.value = formatPmDecimalDisplay(parsed)
      }}
      onClick={onClick}
    />
  )
}
