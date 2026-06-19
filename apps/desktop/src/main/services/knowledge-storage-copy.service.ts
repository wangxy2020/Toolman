import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

export function copyScannedFilesToStorage(
  storagePath: string,
  sourceRoot: string,
  filePaths: string[],
): string[] {
  const root = resolve(sourceRoot)
  const storage = resolve(storagePath)
  const copied: string[] = []

  for (const filePath of filePaths) {
    const absolutePath = resolve(filePath)
    const rel = relative(root, absolutePath)
    if (rel.startsWith('..')) continue

    const destinationPath = join(storage, rel)
    mkdirSync(dirname(destinationPath), { recursive: true })

    if (!existsSync(destinationPath)) {
      copyFileSync(absolutePath, destinationPath)
    }

    copied.push(destinationPath)
  }

  return copied
}
