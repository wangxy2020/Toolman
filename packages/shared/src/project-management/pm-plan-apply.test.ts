import { describe, expect, it } from 'vitest'

import {
  buildPmNewProjectBriefMessage,
  buildPmNewProjectBriefMessageFromProject,
  formatPmPlanAsMarkdownTable,
  presentPmPlanMarkdownForDisplay,
  mergePmScheduleIntoWbsSuggestions,
  nextDefaultPmProjectCode,
  nextDefaultPmProjectName,
  parsePmFullPlanFromText,
  parsePmScheduleSuggestionsFromText,
  parsePmWbsSuggestionsFromText,
  PmApplyWbsInputSchema,
  PmWbsSuggestionSchema,
  presentPmNewProjectBriefForDisplay,
  resolvePmWbsSuggestionDates,
} from './pm-plan-apply.js'

describe('parsePmWbsSuggestionsFromText', () => {
  it('parses a JSON array from assistant output', () => {
    const text = `建议如下：
\`\`\`json
[
  { "title": "基础施工", "type": "task", "startDate": "2026-01-10", "dueDate": "2026-02-01", "priority": "high" }
]
\`\`\``

    const suggestions = parsePmWbsSuggestionsFromText(text)
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]?.title).toBe('基础施工')
    expect(suggestions[0]?.priority).toBe('high')
  })

  it('parses hierarchical WBS object with projectPlan and predecessors', () => {
    const text = `\`\`\`json
{
  "projectPlan": { "planStart": "2026-03-01", "planFinish": "2026-06-30", "durationDays": 120 },
  "wbs": [
    { "title": "单位工程A", "type": "wbs_node", "durationDays": 90 },
    {
      "title": "分部一",
      "type": "phase",
      "parentTitle": "单位工程A",
      "startDate": "2026-03-01",
      "dueDate": "2026-04-15",
      "predecessors": [{ "title": "单位工程A", "type": "FS", "lagDays": 0 }]
    }
  ]
}
\`\`\``

    const plan = parsePmFullPlanFromText(text)
    expect(plan.projectPlan?.planStart).toBe('2026-03-01')
    expect(plan.projectPlan?.durationDays).toBe(120)
    expect(plan.wbs).toHaveLength(2)
    expect(plan.wbs[1]?.parentTitle).toBe('单位工程A')
    expect(plan.wbs[1]?.predecessors?.[0]?.type).toBe('FS')
  })

  it('parses WBS from markdown table without JSON', () => {
    const text = [
      '### 一、任务表（WBS层级）',
      '',
      '| 层级 | 任务名称 | 工期(天) | 开始日期 | 完成日期 | 前置任务 |',
      '| --- | --- | --- | --- | --- | --- |',
      '| 1 | PRJ-2602 · Toolman项目2 | 30 | 2026-08-01 | 2026-08-30 | — |',
      '| 1.1 | 施工准备 | 10 | 2026-08-01 | 2026-08-10 | — |',
      '| 1.1.1 | 现场勘察 | 5 | 2026-08-01 | 2026-08-05 | — |',
      '| 1.1.2 | 临时设施 | 5 | 2026-08-06 | 2026-08-10 | 1.1.1FS |',
      '| 1.2 | 主体结构 | 20 | 2026-08-11 | 2026-08-30 | — |',
      '| 1.2.1 | 一层结构 | 20 | 2026-08-11 | 2026-08-30 | 1.1.2FS |',
      '',
      '### 二、计划合规性说明',
      '- 总工期 30 天',
      '',
      '### 三、关键路径说明',
      '- 勘察 → 临时设施 → 一层结构',
      '',
      '### 四、调度说明',
      '- 无额外并行',
    ].join('\n')

    const plan = parsePmFullPlanFromText(text)
    expect(plan.projectPlan).toEqual({
      planStart: '2026-08-01',
      planFinish: '2026-08-30',
      durationDays: 30,
    })
    expect(plan.wbs.map((item) => item.title)).toEqual([
      '施工准备',
      '现场勘察',
      '临时设施',
      '主体结构',
      '一层结构',
    ])
    expect(plan.wbs.find((item) => item.title === '临时设施')?.predecessors).toEqual([
      { title: '现场勘察', type: 'FS' },
    ])
    expect(plan.wbs.find((item) => item.title === '一层结构')?.parentTitle).toBe('主体结构')
    expect(plan.wbs.find((item) => item.title === '施工准备')?.type).toBe('phase')
    expect(plan.wbs.find((item) => item.title === '现场勘察')?.type).toBe('task')
    // Summary phase predecessors are cleared by hierarchy normalization.
    expect(plan.wbs.find((item) => item.title === '主体结构')?.predecessors ?? []).toEqual([])
  })

  it('prefers markdown table over conflicting JSON payload', () => {
    const text = [
      '| 层级 | 任务名称 | 工期(天) | 开始日期 | 完成日期 | 前置任务 |',
      '| --- | --- | --- | --- | --- | --- |',
      '| 1 | Demo | 5 | 2026-01-01 | 2026-01-05 | — |',
      '| 1.1 | 从表解析 | 5 | 2026-01-01 | 2026-01-05 | — |',
      '',
      '```json',
      JSON.stringify({
        projectName: 'Demo',
        wbs: [{ title: '从 JSON 解析', type: 'task', durationDays: 5 }],
      }),
      '```',
    ].join('\n')
    const plan = parsePmFullPlanFromText(text)
    expect(plan.wbs.map((item) => item.title)).toEqual(['从表解析'])
  })

  it('removes duplicate project root and orders each parent before its children', () => {
    const text = JSON.stringify({
      projectName: 'Toolman项目2',
      projectPlan: { planStart: '2026-01-01', planFinish: '2026-12-31', durationDays: 365 },
      wbs: [
        { title: 'PRJ-2602 · Toolman项目2', type: 'wbs_node' },
        {
          title: '阶段一',
          type: 'phase',
          parentTitle: 'PRJ-2602 · Toolman项目2',
          predecessors: [{ title: '准备任务', type: 'FS' }],
        },
        { title: '阶段二', type: 'phase', parentTitle: 'PRJ-2602 · Toolman项目2' },
        { title: '任务一', type: 'task', parentTitle: '阶段一' },
        { title: '任务二', type: 'task', parentTitle: '阶段二' },
      ],
    })

    const plan = parsePmFullPlanFromText(text)
    expect(plan.wbs.map((item) => item.title)).toEqual(['阶段一', '任务一', '阶段二', '任务二'])
    expect(plan.wbs[0]?.parentTitle).toBeUndefined()
    expect(plan.wbs[0]?.predecessors).toEqual([])
    expect(plan.wbs.some((item) => item.title.includes('Toolman项目2'))).toBe(false)
  })
})

describe('PmWbsSuggestionSchema', () => {
  it('accepts extended fields', () => {
    const parsed = PmWbsSuggestionSchema.parse({
      title: '分项',
      parentTitle: '分部',
      durationDays: 5,
      predecessors: [{ title: '准备', type: 'SS', lagDays: 1 }],
    })
    expect(parsed.durationDays).toBe(5)
    expect(parsed.predecessors?.[0]?.lagDays).toBe(1)
  })
})

describe('PmApplyWbsInputSchema', () => {
  const workspaceId = '00000000-0000-0000-0000-000000000002'

  it('accepts createProject + optional projectId', () => {
    const parsed = PmApplyWbsInputSchema.parse({
      workspaceId,
      suggestions: [{ title: '根任务' }],
      createProject: {
        name: 'Toolman项目1',
        description: '概况',
        clearExisting: true,
      },
      projectPlan: { planStart: '2026-01-01', planFinish: '2026-03-01' },
    })
    expect(parsed.createProject?.name).toBe('Toolman项目1')
    expect(parsed.projectId).toBeUndefined()
  })
})

describe('parsePmScheduleSuggestionsFromText', () => {
  it('parses markdown table rows', () => {
    const text = `
| workItemTitle | suggestedStartDate | suggestedDueDate | reason |
| --- | --- | --- | --- |
| 进度计划复核 | 2026-01-05 | 2026-01-20 | 关键路径前置 |
`

    const suggestions = parsePmScheduleSuggestionsFromText(text)
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]?.workItemTitle).toBe('进度计划复核')
    expect(suggestions[0]?.suggestedStartDate).toBe('2026-01-05')
  })

  it('ignores resource-plan style tables without dates', () => {
    const text = `
| 任务名称 | 类型 | 资源名称 | 数量 | 单位 |
| --- | --- | --- | --- | --- |
| 1层主体结构施工 | 人力 | 钢筋工 | 15 | 工日 |
`
    expect(parsePmScheduleSuggestionsFromText(text)).toEqual([])
  })
})

describe('mergePmScheduleIntoWbsSuggestions', () => {
  it('fills missing dates from schedule table', () => {
    const merged = mergePmScheduleIntoWbsSuggestions(
      [{ title: '任务A', durationDays: 3 }],
      [
        {
          workItemTitle: '任务A',
          suggestedStartDate: '2026-02-01',
          suggestedDueDate: '2026-02-03',
        },
      ],
    )
    expect(merged[0]?.startDate).toBe('2026-02-01')
    expect(merged[0]?.dueDate).toBe('2026-02-03')
  })
})

describe('resolvePmWbsSuggestionDates', () => {
  it('derives dueDate from startDate + durationDays', () => {
    const dates = resolvePmWbsSuggestionDates({
      title: 'x',
      startDate: '2026-01-01',
      durationDays: 3,
    })
    expect(dates.startDate).toBe(Date.parse('2026-01-01'))
    expect(dates.dueDate).toBe(Date.parse('2026-01-03'))
  })
})

describe('nextDefaultPmProjectName', () => {
  it('starts at 1 and increments from existing prefix names', () => {
    expect(nextDefaultPmProjectName([])).toBe('Toolman项目1')
    expect(nextDefaultPmProjectName(['Toolman项目1', '其他', 'Toolman项目3'])).toBe(
      'Toolman项目4',
    )
  })
})

describe('nextDefaultPmProjectCode', () => {
  it('uses YYSS like EPC codes for the current year', () => {
    const now = new Date(2026, 0, 1)
    expect(nextDefaultPmProjectCode([], 'PRJ-', now)).toBe('PRJ-2601')
    expect(nextDefaultPmProjectCode(['PRJ-2601', 'EPC-2412', 'PRJ-2603'], 'PRJ-', now)).toBe(
      'PRJ-2604',
    )
    expect(nextDefaultPmProjectCode(['PRJ-2509'], 'PRJ-', now)).toBe('PRJ-2601')
  })
})

describe('formatPmPlanAsMarkdownTable', () => {
  it('renders project root, outline, predecessors and dates', () => {
    const table = formatPmPlanAsMarkdownTable(
      {
        projectPlan: {
          planStart: '2026-08-01',
          planFinish: '2027-07-20',
          durationDays: 353,
        },
        wbs: [
          {
            title: '一、施工准备与拆除',
            type: 'phase',
            durationDays: 25,
            startDate: '2026-08-01',
            dueDate: '2026-08-25',
          },
          {
            title: '现状建筑拆除',
            parentTitle: '一、施工准备与拆除',
            durationDays: 20,
            startDate: '2026-08-06',
            dueDate: '2026-08-25',
            predecessors: [{ title: '施工临建', type: 'FS', lagDays: 0 }],
          },
          {
            title: '管线预埋',
            parentTitle: '一、施工准备与拆除',
            durationDays: 10,
            startDate: '2026-08-10',
            dueDate: '2026-08-19',
            predecessors: [{ title: '现状建筑拆除', type: 'SS', lagDays: 5 }],
          },
        ],
      },
      { projectName: 'PRJ-2602-Toolman项目2' },
    )
    expect(table).toContain('| 层级 | 任务名称 | 工期(天) | 开始日期 | 完成日期 | 前置任务 |')
    expect(table).toContain('| 1 | PRJ-2602-Toolman项目2 | 353 | 2026-08-01 | 2027-07-20 | — |')
    expect(table).toContain('| 1.1 |')
    expect(table).toContain('一、施工准备与拆除')
    expect(table).toContain('| 1.1.1 |')
    expect(table).toContain('现状建筑拆除')
    expect(table).toContain('施工临建FS')
    expect(table).toContain('1.1.1SS+5')
    expect(table).not.toContain('现状建筑拆除 SS')
  })

  it('keeps flat WBS as a single level under the project root', () => {
    const table = formatPmPlanAsMarkdownTable(
      {
        projectPlan: { planStart: '2026-08-01', planFinish: '2026-08-20', durationDays: 20 },
        wbs: [
          { title: '任务A', parentTitle: null as unknown as undefined, durationDays: 5, startDate: '2026-08-01', dueDate: '2026-08-05' },
          { title: '任务B', parentTitle: '不存在的父级', durationDays: 5, startDate: '2026-08-06', dueDate: '2026-08-10' },
          { title: '任务C', durationDays: 5, startDate: '2026-08-11', dueDate: '2026-08-15' },
        ],
      },
      { projectName: 'Toolman项目2' },
    )
    expect(table).toContain('| 1 | Toolman项目2 |')
    expect(table).toContain('| 1.1 |')
    expect(table).toContain('| 1.2 |')
    expect(table).toContain('| 1.3 |')
    expect(table).not.toContain('| 1.1.1 |')
  })

  it('prefers project-like titles over assistant prose for the root row', () => {
    const source = [
      '理解。既然这是纯施工项目，我将重构WBS。',
      'PRJ-2602 Toolman项目2',
      '',
      '```json',
      JSON.stringify({
        projectName: 'Toolman项目2',
        projectPlan: { planStart: '2026-08-01', planFinish: '2026-08-25', durationDays: 25 },
        wbs: [
          {
            title: '进场',
            durationDays: 5,
            startDate: '2026-08-01',
            dueDate: '2026-08-05',
          },
          {
            title: '施工准备',
            durationDays: 20,
            startDate: '2026-08-06',
            dueDate: '2026-08-25',
            predecessors: [{ title: '进场', type: 'FS' }],
          },
        ],
      }),
      '```',
    ].join('\n')
    const presented = presentPmPlanMarkdownForDisplay(source)
    expect(presented).toContain('| 1 | Toolman项目2 | 25 |')
    expect(presented).toContain('| 1.1 |')
    expect(presented).toContain('| 1.2 |')
    expect(presented).toContain('施工准备')
    expect(presented).toContain('1.1FS')
    expect(presented).not.toContain('进场 FS')
    expect(presented).not.toContain('"wbs"')
    expect(presented).not.toMatch(/\| 1 \| 理解/)
  })

  it('does not use schedule-adjustment prose as the project root title', () => {
    const prose = '已检查各任务间逻辑关系，移除多项不必要的滞后量，调整如下'
    const source = [
      prose,
      '',
      '```json',
      JSON.stringify({
        projectPlan: { planStart: '2026-08-01', planFinish: '2027-09-01', durationDays: 397 },
        wbs: [
          {
            title: '一、施工准备与拆除',
            durationDays: 50,
            startDate: '2026-08-01',
            dueDate: '2026-09-19',
          },
        ],
      }),
      '```',
    ].join('\n')
    const presented = presentPmPlanMarkdownForDisplay(source, {
      fallbackProjectName: 'PRJ-2601 · Toolman项目1',
    })
    expect(presented).toContain('| 1 | PRJ-2601 · Toolman项目1 |')
    expect(presented).not.toMatch(new RegExp(`\\| 1 \\| ${prose}`))
    expect(presented).toMatch(/\| :---: \| --- \| :---: \|/)
  })

  it('rejects implausible projectName values from JSON', () => {
    const presented = presentPmPlanMarkdownForDisplay(
      [
        '```json',
        JSON.stringify({
          projectName: '已检查各任务间逻辑关系，调整如下',
          projectPlan: { planStart: '2026-08-01', planFinish: '2026-08-10', durationDays: 10 },
          wbs: [{ title: '进场', durationDays: 10, startDate: '2026-08-01', dueDate: '2026-08-10' }],
        }),
        '```',
      ].join('\n'),
    )
    expect(presented).toContain('| 1 | 项目 |')
    expect(presented).not.toContain('已检查各任务间逻辑关系')
  })

  it('hides machine JSON when a readable WBS table is already present', () => {
    const source = [
      '### 一、Markdown 排期表（层级 WBS）',
      '',
      '| 层级 | 任务名称 | 工期(天) | 开始日期 | 完成日期 | 前置任务 |',
      '| --- | --- | --- | --- | --- | --- |',
      '| 1 | PRJ-2602 · Toolman项目2 | 10 | 2026-01-01 | 2026-01-10 | — |',
      '| 1.1 | 施工准备 | 10 | 2026-01-01 | 2026-01-10 | — |',
      '',
      '### 二、系统 JSON（可解析计划）',
      '',
      '```json',
      JSON.stringify({
        projectName: 'Toolman项目2',
        projectPlan: { planStart: '2026-01-01', planFinish: '2026-01-10', durationDays: 10 },
        wbs: [
          {
            title: '施工准备',
            type: 'task',
            durationDays: 10,
            startDate: '2026-01-01',
            dueDate: '2026-01-10',
          },
        ],
      }),
      '```',
      '',
      '### 三、关键路径说明',
      '| 关键路径段 | 持续时间 | 说明 |',
      '| --- | --- | --- |',
      '| 准备 → 交付 | 10d | 主路径 |',
      '',
      '### 四、调度说明',
      '- 计划说明仍可显示。',
    ].join('\n')

    const presented = presentPmPlanMarkdownForDisplay(source)
    expect(presented).toContain('Markdown 排期表')
    expect(presented).toContain('| 1.1 | 施工准备 |')
    expect(presented).toContain('三、关键路径说明')
    expect(presented).toContain('主路径')
    expect(presented).toContain('四、调度说明')
    expect(presented).not.toContain('系统 JSON')
    expect(presented).not.toContain('"projectPlan"')
    expect(presented).not.toContain('```json')
  })
})

describe('buildPmNewProjectBriefMessage', () => {
  it('includes overview and markdown-only output contract', () => {
    const message = buildPmNewProjectBriefMessage({
      name: 'Toolman项目1',
      overview: '新建办公楼装修',
      durationDays: 60,
    })
    expect(message).toContain('Toolman项目1')
    expect(message).toContain('新建办公楼装修')
    expect(message).toContain('一、任务表（WBS层级）')
    expect(message).toContain('二、计划合规性说明')
    expect(message).toContain('三、关键路径说明')
    expect(message).toContain('四、调度说明')
    expect(message).toContain('不要输出 JSON')
    expect(message).not.toContain('parentTitle')
    expect(message).not.toContain('"projectPlan"')
  })

  it('includes optional schedule fields from create dialog', () => {
    const message = buildPmNewProjectBriefMessage({
      name: 'Toolman项目2',
      overview: '市政道路改造',
      code: 'PRJ-ABC',
      planStart: '2026-01-01',
      planFinish: '2026-06-30',
    })
    expect(message).toContain('PRJ-ABC')
    expect(message).toContain('2026-01-01')
    expect(message).toContain('2026-06-30')
  })
})

describe('presentPmNewProjectBriefForDisplay', () => {
  it('shows only the brief fields and hides the JSON contract', () => {
    const source = buildPmNewProjectBriefMessageFromProject({
      code: 'PRJ-2602',
      name: 'Toolman项目2',
      description: '本项目拟建教学楼1栋，工期要求360天。',
      metadata: {},
    })
    const presented = presentPmNewProjectBriefForDisplay(source)
    expect(presented).toContain('### 新建项目')
    expect(presented).toContain('Toolman项目2')
    expect(presented).toContain('PRJ-2602')
    expect(presented).toContain('本项目拟建教学楼1栋')
    expect(presented).toContain('未指定（由智能体依据概况推断）')
    expect(presented).toContain('请计划智能体生成层级 WBS、排期与前置关系。')
    expect(presented).not.toContain('已请计划智能体')
    expect(presented).not.toContain('## 输出要求')
    expect(presented).not.toContain('"projectPlan"')
    expect(presented).not.toContain('```json')
    expect(presented).not.toContain('parentTitle')
  })

  it('is applied by the shared display presenter', () => {
    const source = buildPmNewProjectBriefMessageFromProject({
      code: 'PRJ-1',
      name: 'Demo',
      description: '概况说明',
      metadata: { planStartDate: '2026-01-01', planFinishDate: '2026-01-10' },
    })
    const presented = presentPmPlanMarkdownForDisplay(source)
    expect(presented).toContain('### 新建项目')
    expect(presented).not.toContain('"wbs"')
  })

  it('leaves unrelated messages untouched', () => {
    expect(presentPmNewProjectBriefForDisplay('普通消息')).toBe('普通消息')
  })
})

describe('buildPmNewProjectBriefMessageFromProject', () => {
  it('derives duration from plan dates', () => {
    const message = buildPmNewProjectBriefMessageFromProject({
      code: 'PRJ-1',
      name: 'Demo',
      description: '概况说明',
      metadata: {
        planStartDate: '2026-01-01',
        planFinishDate: '2026-01-10',
      },
    })
    expect(message).toContain('概况说明')
    expect(message).toContain('10')
    expect(message).toContain('已在系统中创建')
  })
})
