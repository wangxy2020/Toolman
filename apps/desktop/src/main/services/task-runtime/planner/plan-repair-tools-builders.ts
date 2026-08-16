import type { TaskPlanStep, TaskPlanToolStep } from '@toolman/shared'
import { looksLikeExcelAnalysisGoal } from './plan-repair-goals.js'

export function stringifyToolArgs(args: Record<string, unknown>): string {
  return JSON.stringify(args)
}

export function extractQuotedPath(text: string): string | undefined {
  const match = text.match(/[`'"]([^`'"]+\.(?:xlsx?|csv|txt|md|json))[`'"]/i)
  return match?.[1]
}

export function extractOutputFileName(step: TaskPlanStep, goal: string): string {
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

export function buildDirectoryListingBashTool(outputPath: string): TaskPlanToolStep {
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

export function isCanonicalExcelAnalysisBash(command: string): boolean {
  return /TOOLMAN_EXCEL_ANALYSIS_V2/.test(command)
}

export function buildExcelAnalysisBashTool(outputPath: string): TaskPlanToolStep {
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
