import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  installSkillFromMarketPackage,
  resolveSkillInstallSourcePath,
} from './skill-market.adapter'

const installSkillFromDirectory = vi.fn()

vi.mock('../../skill.service', () => ({
  installSkillFromDirectory: (...args: unknown[]) => installSkillFromDirectory(...args),
}))

const tempDirs: string[] = []

function createSkillPackage(): string {
  const dir = join('/tmp', `toolman-skill-adapter-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'SKILL.md'),
    `---
name: demo-skill
description: Demo community skill
---

# Demo Skill
`,
    'utf8',
  )
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  installSkillFromDirectory.mockReset()
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('skill-market.adapter', () => {
  it('resolves extracted package directory when manifest files exist', () => {
    const packagePath = createSkillPackage()
    const sourcePath = resolveSkillInstallSourcePath({
      manifest: {
        schemaVersion: 1,
        skillId: 'demo-skill',
        name: 'demo-skill',
        description: 'Demo community skill',
        files: ['SKILL.md'],
      },
      packagePath,
      resourceId: '00000000-0000-0000-0000-000000000010',
    })

    expect(sourcePath).toBe(packagePath)
  })

  it('installs skill via installSkillFromDirectory', () => {
    const packagePath = createSkillPackage()
    installSkillFromDirectory.mockReturnValue({
      id: 'demo-skill',
      name: 'demo-skill',
      description: 'Demo community skill',
      builtin: false,
      sourcePath: join(packagePath, '..', 'skills', 'demo-skill'),
      hasContent: true,
    })

    const skill = installSkillFromMarketPackage({
      manifest: {
        schemaVersion: 1,
        skillId: 'demo-skill',
        name: 'demo-skill',
        description: 'Demo community skill',
        files: ['SKILL.md'],
      },
      packagePath,
      resourceId: '00000000-0000-0000-0000-000000000010',
    })

    expect(installSkillFromDirectory).toHaveBeenCalledWith({ sourcePath: packagePath })
    expect(skill.id).toBe('demo-skill')
  })

  it('rejects packages without SKILL.md in manifest files', () => {
    const packagePath = createSkillPackage()
    expect(() =>
      resolveSkillInstallSourcePath({
        manifest: {
          schemaVersion: 1,
          skillId: 'demo-skill',
          name: 'demo-skill',
          description: 'Demo community skill',
          files: ['README.md'],
        },
        packagePath,
        resourceId: '00000000-0000-0000-0000-000000000010',
      }),
    ).toThrow(/SKILL\.md/i)
  })
})
