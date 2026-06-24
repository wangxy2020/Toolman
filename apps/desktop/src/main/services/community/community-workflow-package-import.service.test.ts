import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { describe, expect, it } from 'vitest'

import { prepareCommunityWorkflowPackage } from './community-workflow-package-import.service'

function createWorkflowZip(): string {
  const root = mkdtempSync(join(tmpdir(), 'toolman-workflow-import-test-'))
  writeFileSync(
    join(root, 'workflow.json'),
    `${JSON.stringify(
      {
        nodes: [{ id: 'start', type: 'agent' }],
        edges: [],
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
  const zipPath = join(root, 'demo-workflow.zip')
  execFileSync('zip', ['-r', zipPath, 'workflow.json'], { cwd: root })
  return zipPath
}

describe('prepareCommunityWorkflowPackage', () => {
  it('converts external workflow zip into toolman community package', async () => {
    const zipPath = createWorkflowZip()

    const result = await prepareCommunityWorkflowPackage({
      packagePath: zipPath,
      title: 'Demo Workflow',
    })

    expect(result.normalized).toBe(true)
    expect(result.packagePath.endsWith('.toolman-workflow')).toBe(true)
    expect(readFileSync(result.packagePath).subarray(0, 2).toString()).toBe('PK')
  })
})
