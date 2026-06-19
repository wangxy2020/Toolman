import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

import { type SkillInfo } from '@toolman/shared'

import { installSkillFromDirectory } from '../../skill.service'

export const SkillMarketManifestSchema = z.object({
  schemaVersion: z.number().int().positive(),
  skillId: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  includesPrompt: z.boolean().optional(),
  files: z.array(z.string().min(1)).min(1),
})

export type SkillMarketManifest = z.infer<typeof SkillMarketManifestSchema>

export interface SkillMarketInstallInput {
  manifest: Record<string, unknown>
  packagePath: string
  resourceId: string
}

export function resolveSkillInstallSourcePath(input: SkillMarketInstallInput): string {
  const manifest = SkillMarketManifestSchema.parse(input.manifest)
  const packagePath = input.packagePath.trim()

  if (!packagePath) {
    throw new Error('Skill package path is empty')
  }
  if (!existsSync(packagePath)) {
    throw new Error('Skill package directory does not exist')
  }

  if (!manifest.files.includes('SKILL.md')) {
    throw new Error('Skill manifest must include SKILL.md')
  }

  for (const relativePath of manifest.files) {
    const absolutePath = join(packagePath, relativePath)
    if (!existsSync(absolutePath)) {
      throw new Error(`Skill package is missing file: ${relativePath}`)
    }
  }

  return packagePath
}

export function installSkillFromMarketPackage(input: SkillMarketInstallInput): SkillInfo {
  const sourcePath = resolveSkillInstallSourcePath(input)
  return installSkillFromDirectory({ sourcePath })
}
