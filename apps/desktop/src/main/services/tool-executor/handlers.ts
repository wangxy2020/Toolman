import { decodeMcpToolName } from '../mcp-tool-utils'
import { callMcpServerTool } from '../mcp-client-manager.service'
import { browserExecute, browserFetch, browserOpen, browserScreenshot } from '../browser-cdp.service'
import { difyListKnowledges, difySearchKnowledge } from '../dify-knowledge.service'
import type { ToolExecutionContext } from './types'
import { parseArgs } from './types'
import { executeBash } from './bash'
import {
  executeFsDelete,
  executeFsEdit,
  executeFsGlob,
  executeFsGrep,
  executeFsList,
  executeFsRead,
  executeFsWrite,
} from './filesystem'
import { executeGithubRequest, executeHttpFetch } from './network'
import {
  executeAgentTaskCreate,
  executeAgentTaskList,
  executeAgentTaskUpdate,
  executeListLocalKnowledges,
  executeMemoryList,
  executeMemorySave,
  executeReadNote,
  executeSearchLocalKnowledge,
  executeSearchNotes,
  hubInvoke,
  hubList,
} from './integrations'
import { executeSqlListTables, executeSqlQuery } from './sql'

const LEGACY_FS_ALIASES: Record<string, string> = {
  glob: 'fs_glob',
  grep: 'fs_grep',
  edit: 'fs_edit',
}

type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolExecutionContext,
) => Promise<string> | string

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  fs_glob: executeFsGlob,
  fs_grep: executeFsGrep,
  fs_edit: executeFsEdit,
  fs_delete: executeFsDelete,
  bash: executeBash,
  fs_read: executeFsRead,
  fs_write: executeFsWrite,
  fs_list: executeFsList,
  sql_list_tables: executeSqlListTables,
  sql_query: executeSqlQuery,
  http_fetch: (args) => executeHttpFetch(args),
  browser_open: (args) => browserOpen(args),
  browser_execute: (args) => browserExecute(args),
  browser_screenshot: (args) => browserScreenshot(args),
  browser_fetch: (args) => browserFetch(args),
  github_request: executeGithubRequest,
  list_knowledges: (_args, context) => difyListKnowledges(context.environmentVariables),
  search_knowledge: (args, context) => difySearchKnowledge(args, context.environmentVariables),
  list_local_knowledges: (_args, context) => executeListLocalKnowledges(context),
  search_local_knowledge: (args, context) => executeSearchLocalKnowledge(args, context),
  search_notes: (args) => executeSearchNotes(args),
  read_note: (args) => executeReadNote(args),
  hub_list: (args, context) => hubList(args, context.mcpServerIds ?? []),
  hub_invoke: (args, context) => hubInvoke(args, context, context.mcpServerIds ?? [], executeToolCall),
  memory_save: (args, context) => executeMemorySave(args, context),
  memory_list: (_args, context) => executeMemoryList(context),
  agent_task_create: (args, context) => executeAgentTaskCreate(args, context),
  agent_task_update: (args, context) => executeAgentTaskUpdate(args, context),
  agent_task_list: (_args, context) => executeAgentTaskList(context),
}

export async function executeToolCall(
  toolName: string,
  argsJson: string,
  context: ToolExecutionContext,
): Promise<string> {
  const args = parseArgs(argsJson)
  const mcpTarget = decodeMcpToolName(toolName)
  if (mcpTarget) {
    return callMcpServerTool(mcpTarget.serverId, mcpTarget.toolName, args)
  }

  const resolvedName = LEGACY_FS_ALIASES[toolName] ?? toolName
  const handler = TOOL_HANDLERS[resolvedName]
  if (!handler) {
    throw new Error(`未知工具: ${toolName}`)
  }

  return handler(args, context)
}
