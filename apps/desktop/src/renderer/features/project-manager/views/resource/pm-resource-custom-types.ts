/** Persisted user-defined resource type names (per workspace). */

function customTypeCatalogStorageKey(workspaceId: string): string {
  return `toolman.pm.resourceCustomTypes.${workspaceId}`
}

export function readCustomTypeNameCatalog(workspaceId: string): string[] {
  try {
    const raw = localStorage.getItem(customTypeCatalogStorageKey(workspaceId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const names: string[] = []
    const seen = new Set<string>()
    for (const entry of parsed) {
      if (typeof entry !== 'string') continue
      const name = entry.trim()
      if (!name || seen.has(name)) continue
      seen.add(name)
      names.push(name)
    }
    return names
  } catch {
    return []
  }
}

export function writeCustomTypeNameCatalog(
  workspaceId: string,
  names: readonly string[],
): string[] {
  const next: string[] = []
  const seen = new Set<string>()
  for (const entry of names) {
    const name = entry.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    next.push(name)
  }
  localStorage.setItem(customTypeCatalogStorageKey(workspaceId), JSON.stringify(next))
  return next
}

/** Append a custom type name; no-op when blank or already present. */
export function addCustomTypeNameToCatalog(
  workspaceId: string,
  name: string,
): string[] {
  const trimmed = name.trim()
  const current = readCustomTypeNameCatalog(workspaceId)
  if (!trimmed) return current
  if (current.includes(trimmed)) return current
  return writeCustomTypeNameCatalog(workspaceId, [...current, trimmed])
}

/** Remove a custom type name from the catalog; no-op when missing. */
export function removeCustomTypeNameFromCatalog(
  workspaceId: string,
  name: string,
): string[] {
  const trimmed = name.trim()
  const current = readCustomTypeNameCatalog(workspaceId)
  if (!trimmed) return current
  if (!current.includes(trimmed)) return current
  return writeCustomTypeNameCatalog(
    workspaceId,
    current.filter((entry) => entry !== trimmed),
  )
}
