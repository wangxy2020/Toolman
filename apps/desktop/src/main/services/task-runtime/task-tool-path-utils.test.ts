import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { encodeMcpToolName } from '../mcp-tool-utils'
import { absolutizeTaskMcpToolArgs } from './task-tool-path-utils'

describe('task-tool-path-utils', () => {
  it('absolutizes excel MCP relative paths against working directory', () => {
    const workingDirectory = mkdtempSync(join(tmpdir(), 'toolman-wd-'))
    const toolName = encodeMcpToolName('excel-mcp-server', 'modify_excel_cells')
    const argsJson = JSON.stringify({
      filePath: 'source.xlsx',
      outputPath: '目录表.xlsx',
      changes: [{ sheet: 'Sheet1', cell: 'A1', value: 'x' }],
    })

    const resolved = JSON.parse(absolutizeTaskMcpToolArgs(toolName, argsJson, workingDirectory)) as {
      filePath: string
      outputPath: string
    }

    expect(resolved.filePath).toBe(join(workingDirectory, 'source.xlsx'))
    expect(resolved.outputPath).toBe(join(workingDirectory, '目录表.xlsx'))
  })
})
