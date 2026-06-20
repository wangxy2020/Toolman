import { describe, expect, it } from 'vitest'

import {
  isDuplicateOfficialMcpPreset,
  matchOfficialMcpPresetId,
} from './mcp-preset-utils'

describe('mcp-preset-utils official presets', () => {
  it('matches python preset for mcp-python-interpreter', () => {
    expect(
      matchOfficialMcpPresetId({
        id: 'python',
        type: 'stdio',
        command: 'uvx',
        args: ['mcp-python-interpreter'],
      }),
    ).toBe('python')
  })

  it('matches legacy python preset id for mcp-server-python', () => {
    expect(
      matchOfficialMcpPresetId({
        id: 'custom-python',
        type: 'stdio',
        command: 'uvx',
        args: ['mcp-server-python'],
      }),
    ).toBe('python')
  })

  it('flags duplicate custom python entries', () => {
    expect(
      isDuplicateOfficialMcpPreset({
        id: 'custom-python',
        type: 'stdio',
        command: 'uvx',
        args: ['mcp-python-interpreter'],
      }),
    ).toBe(true)
  })

  it('matches docx-mcp-server npx preset', () => {
    expect(
      matchOfficialMcpPresetId({
        id: 'docx-mcp-server',
        type: 'stdio',
        command: 'npx',
        args: ['-y', 'docx-mcp-server'],
      }),
    ).toBe('docx-mcp-server')
  })
})
