function toSnakeCase(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

function toCamelCase(key: string): string {
  return key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

export function mapKeysDeep(value: unknown, keyFn: (key: string) => string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => mapKeysDeep(item, keyFn))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        keyFn(key),
        mapKeysDeep(nested, keyFn),
      ]),
    )
  }
  return value
}

export function fromApiJson<T = unknown>(value: unknown): T {
  return mapKeysDeep(value, toCamelCase) as T
}

export function toApiJson(value: Record<string, unknown>): Record<string, unknown> {
  return mapKeysDeep(value, toSnakeCase) as Record<string, unknown>
}

export function buildApiQuery(
  params: Record<string, string | number | boolean | string[] | undefined | null>,
): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      if (value.length > 0) search.set(key, value.join(','))
      continue
    }
    search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `?${query}` : ''
}
