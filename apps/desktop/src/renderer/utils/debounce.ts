import { useCallback, useEffect, useRef } from 'react'

export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delayMs: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | undefined

  return (...args: Parameters<T>) => {
    if (timer !== undefined) {
      clearTimeout(timer)
    }
    timer = setTimeout(() => {
      timer = undefined
      fn(...args)
    }, delayMs)
  }
}

export function useDebouncedCallback<T extends (...args: unknown[]) => void>(
  fn: T,
  delayMs: number,
): (...args: Parameters<T>) => void {
  const fnRef = useRef(fn)
  fnRef.current = fn
  const debouncedRef = useRef<((...args: Parameters<T>) => void) | null>(null)

  if (!debouncedRef.current) {
    debouncedRef.current = debounce((...args: unknown[]) => {
      fnRef.current(...(args as Parameters<T>))
    }, delayMs)
  }

  useEffect(() => {
    debouncedRef.current = debounce((...args: unknown[]) => {
      fnRef.current(...(args as Parameters<T>))
    }, delayMs)
  }, [delayMs])

  return useCallback((...args: Parameters<T>) => {
    debouncedRef.current?.(...args)
  }, [])
}
