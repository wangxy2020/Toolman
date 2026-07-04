import { describe, expect, it } from 'vitest'

import { parseTaskPlanFromText, TaskPlanSchema } from './plan.js'

describe('TaskPlanSchema', () => {
  it('parses a valid plan', () => {
    const plan = TaskPlanSchema.parse({
      goal: '整理 notes 目录',
      summary: '读取并汇总 markdown 文件',
      steps: [
        {
          kind: 'scan',
          title: '列出文件',
          description: '扫描工作区',
        },
        {
          kind: 'tool',
          title: '读取 README',
          tool: {
            toolName: 'fs_read',
            argsJson: '{"path":"README.md"}',
          },
        },
      ],
    })
    expect(plan.steps).toHaveLength(2)
  })

  it('extracts plan JSON from markdown fenced block', () => {
    const plan = parseTaskPlanFromText(`
说明如下：

\`\`\`json
{
  "goal": "写入 hello.txt",
  "steps": [
    {
      "kind": "tool",
      "title": "写入文件",
      "tool": { "toolName": "fs_write", "argsJson": "{\\"path\\":\\"hello.txt\\",\\"content\\":\\"hi\\"}" }
    }
  ]
}
\`\`\`
`)
    expect(plan.goal).toBe('写入 hello.txt')
    expect(plan.steps[0]?.tool?.toolName).toBe('fs_write')
  })

  it('normalizes toolName and args at step level', () => {
    const plan = parseTaskPlanFromText(`
{
  "goal": "列出目录",
  "steps": [
    {
      "title": "列出当前目录",
      "toolName": "fs_list",
      "args": { "path": "." }
    }
  ]
}
`)
    expect(plan.steps[0]?.tool?.toolName).toBe('fs_list')
    expect(plan.steps[0]?.tool?.argsJson).toBe('{"path":"."}')
  })
})
