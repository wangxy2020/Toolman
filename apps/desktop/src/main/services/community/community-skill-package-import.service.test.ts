import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { describe, expect, it } from 'vitest'

import { zipDirectory } from './community-package-import.util'
import { prepareCommunitySkillPackage } from './community-skill-package-import.service'

function createSkillZip(): string {
  const root = mkdtempSync(join(tmpdir(), 'toolman-skill-import-test-'))
  writeFileSync(
    join(root, 'SKILL.md'),
    `---
name: demo-skill
description: Demo community skill
---

# Demo Skill
`,
    'utf8',
  )
  const zipPath = join(root, 'demo-skill.zip')
  zipDirectory(root, zipPath)
  return zipPath
}

describe('prepareCommunitySkillPackage', () => {
  it('converts external skill zip into toolman community package', async () => {
    const zipPath = createSkillZip()

    const result = await prepareCommunitySkillPackage({
      packagePath: zipPath,
      title: 'Demo Skill',
    })

    expect(result.normalized).toBe(true)
    expect(result.packagePath.endsWith('.toolman-skill')).toBe(true)
    expect(readFileSync(result.packagePath).subarray(0, 2).toString()).toBe('PK')
  })
})
