import { describe, expect, it } from 'vitest'

import type { TaskPlan } from '@toolman/shared'

import {
  buildHeuristicTaskPlan,
  buildGenericFallbackPlan,
  collapseDirectoryListingPlan,
  ensureExecutableTaskPlan,
  looksLikeExcelAnalysisGoal,
  repairTaskPlan,
  repairTaskPlanStep,
} from './plan-repair'

describe('plan-repair', () => {
  it('coerces scan steps into fs_list tool steps', () => {
    const plan: TaskPlan = {
      goal: '扫描当前文件夹',
      steps: [
        {
          kind: 'scan',
          title: '列出当前文件夹内容',
          description: '扫描工作目录',
        },
      ],
    }

    const repaired = repairTaskPlan(plan)
    expect(repaired.steps[0]?.tool?.toolName).toBe('fs_list')
    expect(repaired.steps[0]?.tool?.argsJson).toContain('"path"')
  })

  it('coerces output steps into self-contained bash export steps', () => {
    const plan: TaskPlan = {
      goal: '生成目录表',
      steps: [
        {
          kind: 'output',
          title: '导出 Excel 目录表',
          description: '写入 directory_listing.csv',
        },
      ],
    }

    const repaired = repairTaskPlan(plan)
    expect(repaired.steps[0]?.tool?.toolName).toBe('bash')
    expect(repaired.steps[0]?.tool?.argsJson).toContain('directory_listing.csv')
  })

  it('builds heuristic plan for directory listing goals as a single bash step', () => {
    const plan = buildHeuristicTaskPlan('扫描当前文件夹，整理出文件目录，生成excel表目录')
    expect(plan?.steps).toHaveLength(1)
    expect(plan?.steps[0]?.tool?.toolName).toBe('bash')
    expect(plan?.steps[0]?.tool?.argsJson).toContain('文件目录清单.xlsx')
  })

  it('collapses fs_list + fs_write into one bash step', () => {
    const plan: TaskPlan = {
      goal: '扫描文件夹并生成目录 Excel',
      steps: [
        {
          kind: 'tool',
          title: '列出目录',
          tool: { toolName: 'fs_list', argsJson: '{"path":"."}' },
        },
        {
          kind: 'tool',
          title: '写入 CSV',
          tool: {
            toolName: 'fs_write',
            argsJson: '{"path":"directory_listing.csv","content":"path,type,name\\n"}',
          },
        },
      ],
    }

    const collapsed = collapseDirectoryListingPlan(plan)
    expect(collapsed.steps).toHaveLength(1)
    expect(collapsed.steps[0]?.tool?.toolName).toBe('bash')
    expect(collapsed.steps[0]?.tool?.argsJson).toContain('文件目录清单.xlsx')
  })

  it('uses heuristic fallback when plan has no tool steps', () => {
    const plan: TaskPlan = {
      goal: '整理文件目录',
      steps: [
        {
          kind: 'report',
          title: '总结结果',
          description: '向用户汇报',
        },
      ],
    }

    const ensured = ensureExecutableTaskPlan(plan)
    expect(ensured.steps.some((step) => step.tool?.toolName === 'bash')).toBe(true)
  })

  it('replaces broken python3 -c bash steps without changing step count', () => {
    const broken = repairTaskPlanStep(
      {
        kind: 'tool',
        title: '生成 Excel',
        tool: {
          toolName: 'bash',
          argsJson: JSON.stringify({
            command:
              "python3 -c \"import os; from openpyxl import Workbook; wb=Workbook(); ws=wb.active; ws.append(['序号','文件名称']); items=sorted(os.listdir('.')); for i,item in enumerate(items,1): ws.append([i,item]); wb.save('文件目录表.xlsx')\"",
          }),
        },
      },
      '扫描文件夹并生成文件目录清单.xlsx',
    )

    expect(broken.tool?.toolName).toBe('bash')
    expect(broken.tool?.argsJson).toContain("<<'PY'")
    expect(broken.tool?.argsJson).not.toContain('python3 -c')
  })

  it('uses generic fs_list fallback for non-file goals without tool steps', () => {
    const plan: TaskPlan = {
      goal: '帮我总结今天的待办事项',
      steps: [
        {
          kind: 'report',
          title: '总结',
          description: '向用户汇报',
        },
      ],
    }

    const ensured = ensureExecutableTaskPlan(plan)
    expect(ensured.steps.some((step) => step.tool?.toolName === 'fs_list')).toBe(true)
  })

  it('buildGenericFallbackPlan produces a single fs_list step', () => {
    const plan = buildGenericFallbackPlan('任意目标')
    expect(plan.steps).toHaveLength(1)
    expect(plan.steps[0]?.tool?.toolName).toBe('fs_list')
  })

  it('classifies excel analysis goals separately from directory listing', () => {
    expect(
      looksLikeExcelAnalysisGoal('检查文件夹内的项目，按顺序统计每个价格表的货币种类和金额'),
    ).toBe(true)
    expect(looksLikeExcelAnalysisGoal('扫描当前文件夹，整理出文件目录，生成excel表目录')).toBe(false)
  })

  it('coerces excel statistics scan step into openpyxl bash instead of fs_list', () => {
    const plan: TaskPlan = {
      goal: '检查文件夹内的项目，统计每个价格表的货币和 IPC 金额',
      steps: [
        {
          kind: 'scan',
          title: '扫描所有Excel价格表并生成统计报告',
          description: '读取 xlsx 并汇总',
        },
      ],
    }

    const repaired = repairTaskPlan(plan)
    expect(repaired.steps).toHaveLength(1)
    expect(repaired.steps[0]?.tool?.toolName).toBe('bash')
    expect(repaired.steps[0]?.tool?.argsJson).toContain('TOOLMAN_EXCEL_ANALYSIS_V2')
    expect(repaired.steps[0]?.tool?.argsJson).toContain('summary_report.csv')
  })

  it('replaces planner bash stubs that only write csv headers', () => {
    const plan: TaskPlan = {
      goal: '检查文件夹内的项目，按顺序统计每个价格表的货币种类和金额',
      steps: [
        {
          kind: 'tool',
          title: '扫描所有Excel文件并统计价格表信息',
          tool: {
            toolName: 'bash',
            argsJson: JSON.stringify({
              command:
                "python3 -c \"import csv; f=open('summary_report.csv','w'); w=csv.writer(f); w.writerow(['文件名','货币种类','总金额','IPC金额']); f.close(); print('done')\"",
            }),
          },
        },
      ],
    }

    const repaired = repairTaskPlan(plan)
    expect(repaired.steps[0]?.tool?.argsJson).toContain('TOOLMAN_EXCEL_ANALYSIS_V2')
    expect(repaired.steps[0]?.tool?.argsJson).not.toContain("writerow(['文件名'")
  })

  it('preserves multi-step plans from the planner', () => {
    const plan: TaskPlan = {
      goal: '整理目录',
      steps: Array.from({ length: 9 }, (_, index) => ({
        kind: 'tool' as const,
        title: `步骤 ${index + 1}`,
        tool: {
          toolName: index % 2 === 0 ? 'fs_list' : 'fs_read',
          argsJson: JSON.stringify({ path: '.' }),
        },
      })),
    }

    const repaired = repairTaskPlan(plan)
    expect(repaired.steps).toHaveLength(9)
  })
})
