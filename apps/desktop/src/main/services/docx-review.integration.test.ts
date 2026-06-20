import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { ToolDefinition } from '@toolman/model-gateway'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { DOCX_MCP_SERVER_ID } from '@toolman/shared'

import { filterDocxMcpToolDefinitions } from './docx-mcp-task.service'
import * as mcpClientManager from './mcp-client-manager.service'
import { encodeMcpToolName } from './mcp-tool-utils'
import { runDocxMcpApplySmokeTest } from './docx-review.service'

function formatToolResult(result: unknown): string {
  const payload =
    result && typeof result === 'object'
      ? (result as { content?: Array<{ type: string; text?: string }>; isError?: boolean })
      : {}
  const chunks: string[] = []
  for (const block of payload.content ?? []) {
    if (block.type === 'text' && block.text) {
      chunks.push(block.text)
    }
  }

  const text = chunks.join('\n').trim()
  if (payload.isError) {
    return text ? `Error: ${text}` : 'Error: 工具执行失败'
  }
  return text || '(无输出)'
}

async function connectDocxMcpForTest(): Promise<{
  client: Client
  tools: ToolDefinition[]
  cleanup: () => Promise<void>
}> {
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', 'docx-mcp-server'],
    env: Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] != null),
    ),
    stderr: 'pipe',
  })

  const client = new Client({ name: 'toolman-docx-test', version: '0.1.0' })
  await client.connect(transport)

  const listed = await client.listTools()
  if (listed.tools.length === 0) {
    await client.close()
    throw new Error('DOCX MCP Server 未返回任何工具')
  }

  const tools: ToolDefinition[] = listed.tools.map((tool) => ({
    type: 'function',
    function: {
      name: encodeMcpToolName(DOCX_MCP_SERVER_ID, tool.name),
      description: tool.description ?? tool.name,
      parameters: (tool.inputSchema as ToolDefinition['function']['parameters']) ?? {
        type: 'object',
        properties: {},
      },
    },
  }))

  return {
    client,
    tools,
    cleanup: async () => {
      await client.close()
    },
  }
}

describe('docx MCP apply integration', () => {
  let mcpReady = false
  let skipReason = 'DOCX MCP Server 不可用'
  let harness: Awaited<ReturnType<typeof connectDocxMcpForTest>> | null = null

  beforeAll(async () => {
    try {
      harness = await connectDocxMcpForTest()
      vi.spyOn(mcpClientManager, 'callMcpServerTool').mockImplementation(async (_serverId, toolName, args) => {
        if (!harness) {
          throw new Error('DOCX MCP 测试 harness 未初始化')
        }
        const result = await harness.client.callTool({
          name: toolName,
          arguments: args,
        })
        return formatToolResult(result)
      })
      mcpReady = true
    } catch (error) {
      skipReason = error instanceof Error ? error.message : skipReason
    }
  }, 120_000)

  afterAll(async () => {
    vi.restoreAllMocks()
    await harness?.cleanup()
  })

  it('creates a document, applies replace + comment, and verifies read_document', async (ctx) => {
    if (!mcpReady || !harness) {
      ctx.skip(skipReason)
    }

    const activeHarness = harness!
    const workdir = await mkdtemp(join(tmpdir(), 'toolman-docx-smoke-'))
    const workingPath = join(workdir, 'smoke.docx')

    try {
      const tools = filterDocxMcpToolDefinitions(activeHarness.tools)
      expect(tools.length).toBeGreaterThan(0)

      const result = await runDocxMcpApplySmokeTest({
        workingPath,
        tools,
        toolContext: { mcpServerIds: [DOCX_MCP_SERVER_ID] },
      })

      expect(result.replacementsApplied).toBeGreaterThanOrEqual(1)
      expect(result.commentsRequested).toBeGreaterThanOrEqual(1)
    } finally {
      await rm(workdir, { recursive: true, force: true })
    }
  }, 120_000)
})
