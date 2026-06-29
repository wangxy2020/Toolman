import type { ToolDefinition } from '@toolman/model-gateway'

export const PREAUTH_TOOL_DEFS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'bash',
      description: '在智能体工作目录中执行 Shell 命令',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: '要执行的命令' },
          cwd: { type: 'string', description: '工作目录，默认为智能体工作目录' },
        },
        required: ['command'],
      },
    },
  },
]

export const MEMORY_TOOL_DEFS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'memory_save',
      description: '保存一条跨会话长期记忆',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '要记住的内容' },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'memory_list',
      description: '列出当前可用的长期记忆',
      parameters: { type: 'object', properties: {} },
    },
  },
]

export const NOTES_TOOL_DEFS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'search_notes',
      description: '搜索用户笔记的标题、正文与标签',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
          tag: { type: 'string', description: '可选，按标签筛选' },
          notebookId: { type: 'string', description: '可选，限定笔记本 ID' },
          limit: { type: 'number', description: '返回条数，默认 10' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_note',
      description: '读取一篇笔记的完整 Markdown 内容',
      parameters: {
        type: 'object',
        properties: {
          noteId: { type: 'string', description: '笔记 ID（来自 search_notes 结果）' },
        },
        required: ['noteId'],
      },
    },
  },
]

export const LOCAL_KNOWLEDGE_TOOL_DEFS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'list_local_knowledges',
      description: '列出当前工作区的本地知识库',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_local_knowledge',
      description:
        '在当前工作区的本地知识库中检索内容。未指定 kbId 时，仅检索当前智能体已绑定的知识库；若未绑定则检索工作区内全部知识库。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '检索问题' },
          kbId: { type: 'string', description: '可选，指定单个知识库 ID；省略时按智能体绑定范围检索' },
          topK: { type: 'number', description: '返回条数，默认 6' },
        },
        required: ['query'],
      },
    },
  },
]

export const AUTONOMOUS_TASK_TOOL_DEFS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'agent_task_create',
      description: '创建一项待办任务，用于自主推进多步骤工作',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '任务标题' },
          notes: { type: 'string', description: '补充说明（可选）' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'agent_task_update',
      description: '更新任务状态或备注',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: '任务 ID' },
          status: {
            type: 'string',
            enum: ['pending', 'in_progress', 'completed', 'cancelled'],
            description: '任务状态',
          },
          notes: { type: 'string', description: '更新备注（可选）' },
        },
        required: ['taskId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'agent_task_list',
      description: '列出当前智能体的任务清单',
      parameters: { type: 'object', properties: {} },
    },
  },
]
