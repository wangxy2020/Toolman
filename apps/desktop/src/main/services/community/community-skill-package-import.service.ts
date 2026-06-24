import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { z } from 'zod'

import { SkillMarketManifestSchema } from './adapters/skill-market.adapter'
import {
  assertZipSource,
  extractZip,
  isCommunityReadyPackage,
  listRelativeFiles,
  readJsonFile,
  repackDirectory,
  resolvePackageRoot,
  safeZipBaseName,
  slugifyCommunityId,
  type PrepareCommunityPackageResult,
} from './community-package-import.util'

const SKILL_MANIFEST_FILENAME = 'skill.manifest.json'
const SKILL_MD_FILENAME = 'SKILL.md'

const PrepareInputSchema = z.object({
  packagePath: z.string().min(1),
  title: z.string().optional(),
})

function parseSkillFrontmatter(content: string): { name: string; description: string } {
  const trimmed = content.trim()
  if (!trimmed.startsWith('---')) {
    throw new Error('SKILL.md must include YAML frontmatter with name and description')
  }

  const lines = trimmed.split('\n')
  if (lines[0]?.trim() !== '---') {
    throw new Error('SKILL.md must include YAML frontmatter with name and description')
  }

  const meta = new Map<string, string>()
  let closed = false
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line?.trim() === '---') {
      closed = true
      break
    }
    const trimmedLine = line?.trim() ?? ''
    if (!trimmedLine || trimmedLine.startsWith('#')) continue
    const separator = trimmedLine.indexOf(':')
    if (separator <= 0) continue
    const key = trimmedLine.slice(0, separator).trim()
    const value = trimmedLine.slice(separator + 1).trim()
    meta.set(key, value)
  }

  if (!closed) {
    throw new Error('SKILL.md must include YAML frontmatter with name and description')
  }

  const name = meta.get('name')?.trim()
  const description = meta.get('description')?.trim()
  if (!name) {
    throw new Error('SKILL.md frontmatter missing name')
  }
  if (!description) {
    throw new Error('SKILL.md frontmatter missing description')
  }

  return { name, description }
}

function syncManifestWithSkillMd(
  packageRoot: string,
  manifest: Record<string, unknown>,
): Record<string, unknown> {
  const skillMdPath = join(packageRoot, SKILL_MD_FILENAME)
  if (!existsSync(skillMdPath)) {
    throw new Error('Skill 包缺少 SKILL.md')
  }

  const frontmatter = parseSkillFrontmatter(readFileSync(skillMdPath, 'utf8'))
  const files = listPackageFiles(packageRoot)
  if (!files.includes(SKILL_MD_FILENAME)) {
    throw new Error('Skill 包缺少 SKILL.md')
  }

  const skillId =
    typeof manifest.skillId === 'string' && manifest.skillId.trim()
      ? manifest.skillId.trim()
      : slugifyCommunityId(frontmatter.name)

  return SkillMarketManifestSchema.parse({
    schemaVersion: 1,
    skillId,
    name: frontmatter.name,
    description: frontmatter.description,
    includesPrompt: manifest.includesPrompt ?? true,
    files,
  }) as Record<string, unknown>
}

function listPackageFiles(packageRoot: string): string[] {
  return listRelativeFiles(packageRoot).filter((file) => file !== 'SHA256SUMS')
}

function inferManifestFromSkillMd(packageRoot: string, fallbackTitle?: string): Record<string, unknown> {
  const skillMdPath = join(packageRoot, SKILL_MD_FILENAME)
  if (!existsSync(skillMdPath)) {
    throw new Error(
      '无法从该 zip 识别 Skill。请确认压缩包内含 SKILL.md（含 name/description 前言），或已是 Toolman 社区包（含 skill.manifest.json）。',
    )
  }

  const frontmatter = parseSkillFrontmatter(readFileSync(skillMdPath, 'utf8'))
  const files = listPackageFiles(packageRoot)
  const skillId = slugifyCommunityId(fallbackTitle?.trim() || frontmatter.name)

  return SkillMarketManifestSchema.parse({
    schemaVersion: 1,
    skillId,
    name: frontmatter.name,
    description: frontmatter.description,
    includesPrompt: true,
    files,
  }) as Record<string, unknown>
}

export async function prepareCommunitySkillPackage(
  input: unknown,
): Promise<PrepareCommunityPackageResult> {
  const parsed = PrepareInputSchema.parse(input)
  const sourcePath = parsed.packagePath
  assertZipSource(sourcePath, 'Skill 资源包')

  const stagingRoot = mkdtempSync(join(tmpdir(), 'toolman-skill-import-'))
  const extractDir = join(stagingRoot, 'extract')
  try {
    extractZip(sourcePath, extractDir, 'Skill 压缩包')
    const packageRoot = resolvePackageRoot(extractDir, [
      SKILL_MANIFEST_FILENAME,
      SKILL_MD_FILENAME,
    ])

    if (isCommunityReadyPackage(packageRoot, SKILL_MANIFEST_FILENAME)) {
      try {
        const existing = readJsonFile<Record<string, unknown>>(join(packageRoot, SKILL_MANIFEST_FILENAME))
        const skillMd = existsSync(join(packageRoot, SKILL_MD_FILENAME))
          ? readFileSync(join(packageRoot, SKILL_MD_FILENAME), 'utf8')
          : null
        if (existing && skillMd) {
          syncManifestWithSkillMd(packageRoot, existing)
        } else {
          SkillMarketManifestSchema.parse(existing)
        }
        return {
          packagePath: sourcePath,
          normalized: false,
          message: '资源包已符合 Toolman 社区 Skill 格式，可直接提交。',
        }
      } catch {
        // fall through to regenerate checksums / sync manifest
      }
    }

    const manifestPath = join(packageRoot, SKILL_MANIFEST_FILENAME)
    let manifest: Record<string, unknown>
    let generatedManifest = false

    if (existsSync(manifestPath)) {
      const existing = readJsonFile<Record<string, unknown>>(manifestPath)
      if (!existing) {
        throw new Error('skill.manifest.json 无法解析，请检查 JSON 格式')
      }
      manifest = syncManifestWithSkillMd(packageRoot, existing)
    } else {
      manifest = inferManifestFromSkillMd(packageRoot, parsed.title)
      generatedManifest = true
    }

    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

    const zipFileName = `${safeZipBaseName(sourcePath, parsed.title, 'community-skill')}.toolman-skill`
    const repacked = repackDirectory({
      sourceDir: packageRoot,
      zipFileName,
      stagingPrefix: 'toolman-skill-import-pack-',
      zipCommandLabel: 'Skill 资源',
    })

    const message = generatedManifest
      ? '已从外部 Skill zip 自动生成 skill.manifest.json 与 SHA256SUMS，并转换为 .toolman-skill 社区包。'
      : '已同步 manifest 与 SKILL.md 前言，并补全 SHA256SUMS 转换为 .toolman-skill 社区包。'

    return {
      packagePath: repacked.packagePath,
      normalized: true,
      message,
    }
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true })
  }
}
