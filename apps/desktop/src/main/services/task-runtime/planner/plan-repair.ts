import type { TaskPlan, TaskPlanStep, TaskPlanToolStep } from '@toolman/shared'

type TaskPlanContext = Pick<import('@toolman/shared').AgentTask, 'id' | 'assistantId' | 'workspaceId' | 'workspaceRoot'>

function stringifyToolArgs(args: Record<string, unknown>): string {
  return JSON.stringify(args)
}

function extractQuotedPath(text: string): string | undefined {
  const match = text.match(/[`'"]([^`'"]+\.(?:xlsx?|csv|txt|md|json))[`'"]/i)
  return match?.[1]
}

function extractOutputFileName(step: TaskPlanStep, goal: string): string {
  const blob = `${step.title} ${step.description ?? ''} ${goal}`
  const fromQuote = extractQuotedPath(blob)
  if (fromQuote) return fromQuote

  const named = blob.match(/([\w\u4e00-\u9fff\-_.]+\.(?:xlsx?|csv|txt|md))/i)
  if (named?.[1]) return named[1]

  if (/统计|报告|summary|report/i.test(blob) && !/[\w.-]+\.(?:xlsx?|csv|txt|md)/i.test(blob)) {
    return 'summary_report.csv'
  }

  if (/\.xlsx|excel|表格/i.test(blob)) {
    if (/目录|清单|listing/i.test(blob)) return '文件目录清单.xlsx'
    if (looksLikeExcelAnalysisGoal(blob)) return 'summary_report.csv'
    return 'output.xlsx'
  }
  if (/\.csv/i.test(blob)) {
    return 'directory_listing.csv'
  }
  if (/\.md|markdown/i.test(blob)) {
    return 'directory_listing.md'
  }

  return 'directory_listing.csv'
}

function buildDirectoryListingBashTool(outputPath: string): TaskPlanToolStep {
  const safeOut = outputPath.replace(/'/g, "'\\''")
  const command = `python3 <<'PY'
import csv, os, sys
out = '${safeOut}'
rows = [['序号', '文件名称', '项目目录', '文档资料']]
items = sorted(
    x for x in os.listdir('.')
    if not x.startswith('.') and not x.startswith('~$') and x != '.toolman'
)
for index, name in enumerate(items, 1):
    rows.append([index, name, '.', ''])
ext = os.path.splitext(out)[1].lower()
if ext == '.csv':
    with open(out, 'w', newline='', encoding='utf-8-sig') as fp:
        csv.writer(fp).writerows(rows)
elif ext in ('.xlsx', '.xls'):
    try:
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        for row in rows:
            ws.append(row)
        wb.save(out)
    except ImportError:
        fb = out.rsplit('.', 1)[0] + '.csv'
        with open(fb, 'w', newline='', encoding='utf-8-sig') as fp:
            csv.writer(fp).writerows(rows)
        print('已写入文件: ' + fb)
        sys.exit(0)
else:
    with open(out, 'w', encoding='utf-8') as fp:
        for row in rows:
            fp.write(','.join(str(c) for c in row) + '\\n')
print('已写入文件: ' + out)
PY`
  return {
    toolName: 'bash',
    argsJson: stringifyToolArgs({ command }),
  }
}

function isCanonicalExcelAnalysisBash(command: string): boolean {
  return /TOOLMAN_EXCEL_ANALYSIS_V2/.test(command)
}

function buildExcelAnalysisBashTool(outputPath: string): TaskPlanToolStep {
  const safeOut = outputPath.replace(/'/g, "'\\''")
  const command = `python3 <<'PY'
# TOOLMAN_EXCEL_ANALYSIS_V2
import csv, re, sys
from pathlib import Path

out = '${safeOut}'
rows = [['文件名', '货币种类', '总金额', 'IPC金额']]
CURRENCIES = ('USD', 'TZS', 'EUR', 'GBP', 'CNY', 'RMB', 'KES')
TOTAL_KEYS = ('total', '合计', '总计', 'boq value', 'grand total', 'sub-total', 'subtotal', 'schedule total')

try:
    import openpyxl
except ImportError:
    print('ERROR: openpyxl 未安装，无法读取 Excel')
    sys.exit(1)

def parse_num(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace(',', '')
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None

def find_currencies(*parts):
    found = set()
    for part in parts:
        if not part:
            continue
        upper = str(part).upper()
        for code in CURRENCIES:
            if code in upper or f'[{code}]' in upper:
                found.add(code)
        for match in re.finditer(r'\\[([A-Z]{3})\\]', upper):
            found.add(match.group(1))
    return found

def rel_path(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(Path('.').resolve()))
    except ValueError:
        return str(path)

workbooks = []
lock_only = []

def add_workbook(path: Path) -> None:
    resolved = path.resolve()
    if resolved in workbooks:
        return
    workbooks.append(resolved)

for path in sorted(Path('.').rglob('*')):
    if path.name.startswith('.') or '.toolman' in path.parts:
        continue
    if path.suffix.lower() not in ('.xlsx', '.xls'):
        continue
    if path.name.startswith('~$'):
        real = path.parent / path.name[2:]
        if real.exists() and real.is_file():
            add_workbook(real)
        else:
            lock_only.append(path.name)
        continue
    add_workbook(path)

if not workbooks and lock_only:
    hinted = ', '.join(name[2:] for name in lock_only)
    print('ERROR: 仅发现 Excel 临时锁文件（~$ 开头），无法读取数据。请关闭 Excel 后确认工作簿存在: ' + hinted)
    sys.exit(1)

for path in workbooks:
    name = rel_path(path)
    is_ipc_file = bool(re.search(r'ipc\\d*', path.name, re.I))
    totals_by_ccy = {}
    ipc_amount = ''

    try:
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    except Exception as exc:
        rows.append([name, '', '', f'打开失败: {exc}'])
        continue

    file_ccy = find_currencies(path.name)

    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        sheet_rows = list(ws.iter_rows(values_only=True))
        sheet_ccy = file_ccy | find_currencies(
            sheet_name,
            ' '.join(str(cell) for row in sheet_rows[:10] for cell in row if cell is not None),
        )

        header = None
        header_idx = 0
        for idx, row in enumerate(sheet_rows[:12]):
            cells = [str(cell).strip().lower() if cell is not None else '' for cell in row]
            if any('ipc' in cell or '已申请' in cell for cell in cells):
                header = cells
                header_idx = idx
                break

        if header is not None:
            ipc_col = next((i for i, cell in enumerate(header) if 'ipc' in cell or '已申请' in cell), None)
            if ipc_col is not None:
                for row in sheet_rows[header_idx + 1:]:
                    if not row:
                        continue
                    value = parse_num(row[ipc_col] if ipc_col < len(row) else None)
                    if value is not None and value > 0:
                        ipc_amount = str(value)

        scan_rows = sheet_rows[-40:] if len(sheet_rows) > 40 else sheet_rows
        for row in reversed(scan_rows):
            if not row:
                continue
            texts = [str(cell).lower() for cell in row if cell is not None]
            joined = ' '.join(texts)
            if not any(key in joined for key in TOTAL_KEYS):
                continue
            nums = [num for num in (parse_num(cell) for cell in row) if num is not None and num > 0]
            if not nums:
                continue
            amount = max(nums)
            ccy = ''
            for cell in row:
                if cell is None:
                    continue
                upper = str(cell).upper()
                if upper in CURRENCIES:
                    ccy = upper
                    break
            if not ccy and sheet_ccy:
                ccy = sorted(sheet_ccy)[0]
            totals_by_ccy[ccy or '未知'] = max(totals_by_ccy.get(ccy or '未知', 0), amount)

    wb.close()

    if totals_by_ccy:
        for ccy in sorted(totals_by_ccy, key=lambda item: item or 'ZZZ'):
            rows.append([name, ccy, str(totals_by_ccy[ccy]), ipc_amount if is_ipc_file else ''])
    elif is_ipc_file and ipc_amount:
        rows.append([name, '', '', ipc_amount])
    else:
        rows.append([name, '', '', '未识别到合计行'])

if not workbooks:
    print('ERROR: 工作目录下未找到 Excel 价格表 (.xlsx/.xls)')
    sys.exit(1)

data_rows = [row for row in rows[1:] if any(str(cell).strip() for cell in row[1:])]
if not data_rows:
    print('ERROR: 未能从 Excel 中提取有效统计数据（请确认价格表含合计行或 IPC 列）')
    sys.exit(1)

with open(out, 'w', newline='', encoding='utf-8-sig') as fp:
    csv.writer(fp).writerows(rows)
print('已写入文件: ' + out)
PY`
  return {
    toolName: 'bash',
    argsJson: stringifyToolArgs({ command }),
  }
}

/** Self-contained list + export in one bash step (Executor does not pass data between steps). */
function buildDirectoryListingWriteTool(outputPath: string): TaskPlanToolStep {
  return buildDirectoryListingBashTool(outputPath)
}

function buildExportToolForGoal(
  goal: string,
  step: TaskPlanStep,
  _task?: TaskPlanContext,
): TaskPlanToolStep {
  const path = extractOutputFileName(step, goal)
  if (looksLikeExcelAnalysisGoal(goal)) {
    return buildExcelAnalysisBashTool(path)
  }
  return buildDirectoryListingWriteTool(path)
}

function isDirectoryListingBashCommand(command: string): boolean {
  return /序号.*文件名称|os\.listdir\s*\(\s*['"]\.['"]\s*\)/.test(command)
}

function resolveToolBaseName(toolName: string): string {
  return (toolName.includes('__') ? toolName.split('__').pop() : toolName)?.toLowerCase() ?? toolName.toLowerCase()
}

function parseToolArgsJson(argsJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(argsJson) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // ignore
  }
  return {}
}

function isRiskyDirectoryListingBash(command: string): boolean {
  const lower = command.toLowerCase()
  if (!lower.includes('python')) return false
  return /python3?\s+-c\s/.test(lower)
}

function repairToolStep(
  tool: TaskPlanToolStep,
  goal: string,
  step: TaskPlanStep,
  _task?: TaskPlanContext,
): TaskPlanToolStep {
  const base = resolveToolBaseName(tool.toolName)
  const args = parseToolArgsJson(tool.argsJson)
  const outputPath = extractOutputFileName(step, goal)

  if (base.includes('excel') && tool.toolName.startsWith('mcp__')) {
    return tool
  }
  if (base === 'read_excel' || base === 'review_excel' || base === 'fs_glob') {
    return tool
  }

  if (base === 'bash') {
    const command = typeof args.command === 'string' ? args.command : ''
    if (looksLikeExcelAnalysisGoal(goal)) {
      if (
        !command.trim() ||
        !isCanonicalExcelAnalysisBash(command) ||
        isRiskyDirectoryListingBash(command) ||
        isDirectoryListingBashCommand(command)
      ) {
        return buildExcelAnalysisBashTool(outputPath)
      }
    } else if (command.trim() && isRiskyDirectoryListingBash(command)) {
      return buildDirectoryListingBashTool(outputPath)
    }
  }

  if (base === 'fs_write') {
    const path = typeof args.path === 'string' ? args.path : outputPath
    const content = typeof args.content === 'string' ? args.content.trim() : ''
    const placeholderOnly = !content || /^path,type,name\n?$/i.test(content) || content.length < 48
    if (looksLikeExcelAnalysisGoal(goal) && (placeholderOnly || /\.xlsx?$/i.test(path))) {
      return buildExcelAnalysisBashTool(path.endsWith('.csv') ? path : outputPath)
    }
    if (/\.xlsx?$/i.test(path) || (looksLikeDirectoryListingGoal(goal) && placeholderOnly)) {
      return buildDirectoryListingBashTool(path)
    }
  }

  return tool
}

function isFsListStep(step: TaskPlanStep): boolean {
  if (!step.tool?.toolName?.trim()) {
    return step.kind === 'scan'
  }
  return resolveToolBaseName(step.tool.toolName) === 'fs_list'
}

function isDirectoryExportStep(step: TaskPlanStep): boolean {
  if (!step.tool?.toolName?.trim()) {
    return step.kind === 'output' || step.kind === 'transform'
  }
  const base = resolveToolBaseName(step.tool.toolName)
  return base === 'bash' || base === 'fs_write'
}

/** Merge fs_list + export into one bash step; upgrade placeholder fs_write to bash. */
export function collapseDirectoryListingPlan(plan: TaskPlan): TaskPlan {
  if (looksLikeExcelAnalysisGoal(plan.goal) || !looksLikeDirectoryListingGoal(plan.goal)) {
    return plan
  }

  const upgraded = plan.steps.map((step) => repairTaskPlanStep(step, plan.goal))

  const listIdx = upgraded.findIndex((step) => isFsListStep(step))
  const exportIdx = upgraded.findIndex(
    (step, index) => index !== listIdx && isDirectoryExportStep(step),
  )

  const outputPath = extractOutputFileName(
    exportIdx >= 0 ? upgraded[exportIdx]! : { kind: 'output', title: plan.goal, description: '' },
    plan.goal,
  )
  const mergedStep: TaskPlanStep = {
    kind: 'tool',
    title: '扫描工作目录并导出清单',
    description: '单步自包含：列出目录并写入文件',
    tool: buildDirectoryListingBashTool(outputPath),
  }

  if (listIdx >= 0 && exportIdx >= 0 && listIdx !== exportIdx) {
    const remove = new Set([listIdx, exportIdx])
    return {
      ...plan,
      steps: [mergedStep, ...upgraded.filter((_, index) => !remove.has(index))],
    }
  }

  if (listIdx >= 0 && exportIdx < 0 && /导出|生成|excel|csv|xlsx|表格|清单|write|export/i.test(plan.goal)) {
    return {
      ...plan,
      steps: [mergedStep, ...upgraded.filter((_, index) => index !== listIdx)],
    }
  }

  return { ...plan, steps: upgraded }
}

function extractDirectoryPath(step: TaskPlanStep): string {
  const blob = `${step.title} ${step.description ?? ''}`
  const dotSlash = blob.match(/(?:路径|目录|path)[：:\s]*[`'"]?(\.[^`'"\s]+|[\w./-]+)[`'"]?/i)
  if (dotSlash?.[1]) return dotSlash[1]

  if (/当前|工作目录|本目录|this directory/i.test(blob)) {
    return '.'
  }

  return '.'
}

function normalizeToolArgsJson(tool: TaskPlanToolStep): TaskPlanToolStep {
  const argsJson = tool.argsJson?.trim() || '{}'
  try {
    JSON.parse(argsJson)
    return { toolName: tool.toolName.trim(), argsJson }
  } catch {
    return { toolName: tool.toolName.trim(), argsJson: '{}' }
  }
}

function coerceKindToTool(step: TaskPlanStep, goal: string, task?: TaskPlanContext): TaskPlanStep | null {
  const text = `${step.title} ${step.description ?? ''}`.toLowerCase()

  if (step.kind === 'output' || step.kind === 'transform') {
    return {
      ...step,
      kind: 'tool',
      tool: normalizeToolArgsJson(buildExportToolForGoal(goal, step, task)),
    }
  }

  if (step.kind === 'scan') {
    if (looksLikeExcelAnalysisGoal(goal) || /excel|xlsx|价格表|表格/.test(text)) {
      return {
        ...step,
        kind: 'tool',
        tool: normalizeToolArgsJson(buildExportToolForGoal(goal, step, task)),
      }
    }
    return {
      ...step,
      kind: 'tool',
      tool: normalizeToolArgsJson({
        toolName: 'fs_list',
        argsJson: stringifyToolArgs({ path: extractDirectoryPath(step) }),
      }),
    }
  }

  if (step.kind === 'index') {
    return {
      ...step,
      kind: 'tool',
      tool: normalizeToolArgsJson({
        toolName: 'fs_glob',
        argsJson: stringifyToolArgs({ pattern: '**/*' }),
      }),
    }
  }

  if (step.kind === 'read') {
    const path = extractQuotedPath(`${step.title} ${step.description ?? ''}`) ?? 'README.md'
    return {
      ...step,
      kind: 'tool',
      tool: normalizeToolArgsJson({
        toolName: 'fs_read',
        argsJson: stringifyToolArgs({ path }),
      }),
    }
  }

  if (/写入|导出|生成|write|export|csv|excel|xlsx|表格|报告|统计/.test(text)) {
    return {
      ...step,
      kind: 'tool',
      tool: normalizeToolArgsJson(buildExportToolForGoal(goal, step, task)),
    }
  }

  if (/列出|扫描|list|scan|文件夹/.test(text) || (/目录/.test(text) && !/导出|写入|生成|csv|excel|xlsx|表格|统计|报告/.test(text))) {
    return {
      ...step,
      kind: 'tool',
      tool: normalizeToolArgsJson({
        toolName: 'fs_list',
        argsJson: stringifyToolArgs({ path: extractDirectoryPath(step) }),
      }),
    }
  }

  if (/fs_list|list_dir|list_files/.test(text)) {
    return {
      ...step,
      kind: 'tool',
      tool: normalizeToolArgsJson({
        toolName: 'fs_list',
        argsJson: stringifyToolArgs({ path: extractDirectoryPath(step) }),
      }),
    }
  }

  if (/fs_write|write_file|create_file/.test(text)) {
    return {
      ...step,
      kind: 'tool',
      tool: normalizeToolArgsJson(buildExportToolForGoal(goal, step, task)),
    }
  }

  return null
}

export function repairTaskPlanStep(step: TaskPlanStep, goal: string, task?: TaskPlanContext): TaskPlanStep {
  if (step.tool?.toolName?.trim()) {
    const repaired = repairToolStep(step.tool, goal, step, task)
    return {
      ...step,
      kind: 'tool',
      tool: normalizeToolArgsJson(repaired),
    }
  }

  const coerced = coerceKindToTool(step, goal, task)
  return coerced ?? step
}

export function repairTaskPlan(plan: TaskPlan, task?: TaskPlanContext): TaskPlan {
  const goal = plan.goal
  const steps = plan.steps.map((step) => repairTaskPlanStep(step, goal, task))
  if (looksLikeExcelAnalysisGoal(goal)) {
    const normalized = steps.map((step) => {
      if (!step.tool?.toolName?.trim()) return step
      const base = resolveToolBaseName(step.tool.toolName)
      if (
        step.tool.toolName.startsWith('mcp__') &&
        (base.includes('excel') || base === 'read_excel' || base === 'review_excel')
      ) {
        return step
      }
      if (base === 'fs_glob' || base === 'read_excel' || base === 'review_excel') {
        return step
      }
      if (base !== 'bash' && base !== 'fs_write') return step
      const args = parseToolArgsJson(step.tool.argsJson)
      const command = typeof args.command === 'string' ? args.command : ''
      if (
        base === 'bash' &&
        command.trim() &&
        isCanonicalExcelAnalysisBash(command) &&
        !isDirectoryListingBashCommand(command) &&
        !isRiskyDirectoryListingBash(command)
      ) {
        return step
      }
      return {
        ...step,
        kind: 'tool' as const,
        tool: normalizeToolArgsJson(buildExportToolForGoal(goal, step, task)),
      }
    })
    const hasExcelBash = normalized.some(
      (step) =>
        step.tool &&
        resolveToolBaseName(step.tool.toolName) === 'bash' &&
        isCanonicalExcelAnalysisBash(
          String(parseToolArgsJson(step.tool.argsJson).command ?? ''),
        ),
    )
    const hasExcelMcp = normalized.some(
      (step) =>
        step.tool &&
        (resolveToolBaseName(step.tool.toolName) === 'read_excel' ||
          resolveToolBaseName(step.tool.toolName) === 'fs_glob'),
    )
    if (!hasExcelBash && !hasExcelMcp) {
      return {
        ...plan,
        steps: [
          {
            kind: 'tool',
            title: '扫描 Excel 价格表并生成统计报告',
            tool: buildExcelAnalysisBashTool(
              extractOutputFileName({ kind: 'output', title: goal, description: '' }, goal),
            ),
          },
        ],
      }
    }
    return { ...plan, steps: normalized }
  }
  return collapseDirectoryListingPlan({ ...plan, steps })
}

export function looksLikeExcelAnalysisGoal(goal: string): boolean {
  const text = goal.trim()
  if (!text) return false
  const hasWorkbook = /excel|xlsx|xls|价格表|价表|表格|spreadsheet/i.test(text)
  const hasAnalysis = /统计|汇总|分析|货币|金额|ipc|报告|summary|report|合计|逐/.test(text)
  return hasWorkbook && hasAnalysis
}

export function looksLikeDirectoryListingGoal(goal: string): boolean {
  if (looksLikeExcelAnalysisGoal(goal)) return false
  return /目录|文件夹|文件列表|文件目录|扫描|整理|listing|directory|清单/.test(goal)
    || (/excel|csv|xlsx|表格/.test(goal) && /目录|清单|listing|列表/.test(goal))
}

export function buildHeuristicTaskPlan(goal: string, _task?: TaskPlanContext): TaskPlan | null {
  const trimmed = goal.trim()
  if (!trimmed) return null

  if (looksLikeExcelAnalysisGoal(trimmed)) {
    const outputPath = extractOutputFileName(
      { kind: 'output', title: trimmed, description: '' },
      trimmed,
    )
    return {
      goal: trimmed,
      summary: '系统自动补全：扫描 Excel 价格表并生成汇总 CSV',
      steps: [
        {
          kind: 'tool',
          title: '扫描 Excel 价格表并生成统计报告',
          tool: buildExcelAnalysisBashTool(outputPath),
        },
      ],
    }
  }

  if (looksLikeDirectoryListingGoal(trimmed)) {
    const outputPath = extractOutputFileName(
      { kind: 'output', title: trimmed, description: '' },
      trimmed,
    )
    return {
      goal: trimmed,
      summary: '系统自动补全：扫描工作目录并导出清单',
      steps: [
        {
          kind: 'tool',
          title: '扫描工作目录并导出清单',
          tool: buildDirectoryListingBashTool(outputPath),
        },
      ],
    }
  }

  if (/文件|目录|folder|file|list|read|write|创建|删除|修改/.test(trimmed)) {
    return {
      goal: trimmed,
      summary: '系统自动补全：列出工作目录',
      steps: [
        {
          kind: 'tool',
          title: '列出工作目录',
          tool: {
            toolName: 'fs_list',
            argsJson: stringifyToolArgs({ path: '.' }),
          },
        },
      ],
    }
  }

  return null
}

export function buildGenericFallbackPlan(goal: string): TaskPlan {
  const trimmed = goal.trim()
  return {
    goal: trimmed,
    summary: '系统自动补全：先探查工作目录',
    steps: [
      {
        kind: 'tool',
        title: '列出工作目录',
        tool: {
          toolName: 'fs_list',
          argsJson: stringifyToolArgs({ path: '.' }),
        },
      },
    ],
  }
}

export function ensureExecutableTaskPlan(plan: TaskPlan, task?: TaskPlanContext): TaskPlan {
  const repaired = repairTaskPlan(plan, task)
  const hasTool = repaired.steps.some((step) => Boolean(step.tool?.toolName))
  if (hasTool) return repaired

  return buildHeuristicTaskPlan(repaired.goal, task) ?? buildGenericFallbackPlan(repaired.goal)
}
