import { vi, type Mock } from 'vitest'

type AnyFn = (...args: never[]) => unknown

/**
 * `vi.fn(() => value)` is inferred as a 0-arg mock. Calling it with the real
 * signature then fails `tsc` (TS2554) because test files are typechecked.
 * Pin the mock to the production function type instead.
 */
export function mockFn<T extends AnyFn>(
  implementation?: (...args: Parameters<T>) => ReturnType<T>,
): Mock<T> {
  return (implementation ? vi.fn(implementation as T) : vi.fn()) as Mock<T>
}
