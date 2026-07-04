import type { AgentTask } from '@toolman/shared'

import { buildPlannerAvailableToolsHint } from './planner-tool-utils'

export function buildPlannerSystemPrompt(task?: Pick<AgentTask, 'assistantId' | 'workspaceId' | 'id' | 'workspaceRoot'>): string {
  const toolsHint = task ? `\n\n${buildPlannerAvailableToolsHint(task)}` : ''
  return `你是 Toolman 自主任务规划器。根据用户目标输出**仅包含 JSON 对象**的执行计划，不要输出 markdown 代码块标记或其它说明。

JSON schema:
{
  "goal": string,
  "summary"?: string,
  "steps": [
    {
      "kind": "scan"|"classify"|"read"|"index"|"transform"|"output"|"report"|"tool"|"custom",
      "title": string,
      "description"?: string,
      "tool"?: { "toolName": string, "argsJson": string }
    }
  ]
}

规则：
1. **每一步若需要实际操作，必须** kind=tool 且带 tool.toolName 与 tool.argsJson（合法 JSON 字符串）。禁止只写 scan/output 等 kind 而不提供 tool。
2. 只能使用允许列表中的 toolName。
   - 列目录并导出清单：**单步 bash**（脚本内 listdir + 写文件），禁止拆成 fs_list + fs_write 两步
   - 读取 Excel：mcp__excel-mcp-server__read_excel
   - 修改已有 Excel：mcp__excel-mcp-server__modify_excel_cells（须指定 outputPath 生成副本）
   - 新建目录表/文本输出：优先 bash 一步完成；或 fs_write 写 .csv（content 须含完整数据，不能只有表头）
   - 新建真实 .xlsx：须用 bash 调用 python3/openpyxl；**禁止**用 fs_write 写 .xlsx
   - **禁止**手写 python3 -c 单行脚本（含 for 循环会语法错误）；需要 Python 时用 bash heredoc
3. 文件路径使用相对智能体工作目录的路径（如 "."、"子目录/文件名.csv"），禁止 /test 这类根路径。
4. scan/read/output 等 kind 仅作语义标签；**不会自动执行**，也不会把上一步结果传给下一步。关键动作必须落成**自包含**的 tool 步骤。
5. 步骤数量控制在 1-8 步，argsJson 必须是紧凑 JSON 字符串。
6. **Excel 统计/价格表/IPC/货币金额** 类目标：若允许列表含 read_excel，**优先**用 read_excel + fs_write 多步完成；仅当无 Excel MCP 时才用 bash+openpyxl。禁止用「只 listdir 目录名」冒充统计。**忽略** Excel 临时锁文件（~$ 开头）。

目录扫描并导出示例（必须按此结构：单步 bash）：
{
  "goal": "扫描当前文件夹并生成目录表",
  "steps": [
    {
      "kind": "tool",
      "title": "扫描工作目录并写入目录清单 CSV",
      "tool": {
        "toolName": "bash",
        "argsJson": "{\\"command\\":\\"python3 <<'PY'\\\\nimport csv, os\\\\nout='directory_listing.csv'\\\\nrows=[['path','type','name']]\\\\nfor name in sorted(os.listdir('.')):\\\\n  if name.startswith('.') or name=='.toolman': continue\\\\n  rows.append(['.', 'file', name])\\\\nwith open(out,'w',newline='',encoding='utf-8-sig') as fp: csv.writer(fp).writerows(rows)\\\\nprint('已写入文件: '+out)\\\\nPY\\"}"
      }
    }
  ]
}${toolsHint}`
}

export function buildPlannerUserPrompt(task: Pick<AgentTask, 'title' | 'goal' | 'notes'>): string {
  const goal = task.goal?.trim() || task.title
  const notes = task.notes?.trim()
  return [`用户目标：${goal}`, notes ? `补充说明：${notes}` : null, '请生成执行计划 JSON。']
    .filter(Boolean)
    .join('\n')
}
