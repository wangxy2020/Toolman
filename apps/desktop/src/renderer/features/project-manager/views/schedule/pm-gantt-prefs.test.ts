import { describe, expect, it } from 'vitest'

import {
  buildGridTemplateColumns,
  computeGanttDayWidth,
  dateHeaderHeight,
  insertColumnInCanonicalOrder,
  normalizeGanttUiPrefs,
  resolveColumnLabel,
} from './pm-gantt-prefs'

describe('pm-gantt-prefs', () => {
  it('keeps name column visible', () => {
    const prefs = normalizeGanttUiPrefs({ columnOrder: ['index', 'duration'] })
    expect(prefs.columnOrder).toContain('name')
  })

  it('restores hidden columns at fixed canonical positions', () => {
    expect(insertColumnInCanonicalOrder(['name', 'duration', 'finish'], 'index')).toEqual([
      'index',
      'name',
      'duration',
      'finish',
    ])
    expect(insertColumnInCanonicalOrder(['index', 'name', 'finish'], 'start')).toEqual([
      'index',
      'name',
      'start',
      'finish',
    ])
    expect(insertColumnInCanonicalOrder(['index', 'name', 'start', 'finish'], 'predecessors')).toEqual([
      'index',
      'name',
      'start',
      'finish',
      'predecessors',
    ])
  })

  it('keeps a fixed name width in split gantt view (no content-driven resize)', () => {
    const template = buildGridTemplateColumns(['index', 'name'])
    expect(template).toBe(['48px', '220px'].join(' '))
    expect(template).not.toContain('1fr')
    expect(template).not.toContain('36px')
  })

  it('uses a flexible name width in full-width list layouts', () => {
    const template = buildGridTemplateColumns(['index', 'name', 'duration'], {
      fullWidthList: true,
    })
    expect(template).toBe(['48px', 'minmax(280px, 1fr)', '64px'].join(' '))
    expect(template).not.toContain('36px')
  })

  it('uses a fixed name width and omits flexible tracks for print', () => {
    const template = buildGridTemplateColumns(
      ['index', 'name', 'duration', 'start', 'finish', 'predecessors'],
      { printLayout: true },
    )
    expect(template).toBe(
      ['48px', '200px', '64px', '100px', '100px', '72px'].join(' '),
    )
  })

  it('fits day width to pane so full gantt is visible', () => {
    expect(computeGanttDayWidth(10, 300, 0, 2)).toBe(30)
    expect(computeGanttDayWidth(100, 300, 0, 2)).toBe(3)
    // Small window + long span: shrink below former 2px floor so nothing is clipped.
    expect(computeGanttDayWidth(200, 300, 0, 2)).toBe(1.5)
    expect(computeGanttDayWidth(200, 300, 0, 2) * 200).toBe(300)
  })

  it('migrates legacy dateHeaderRows and keeps bar style defaults', () => {
    expect(normalizeGanttUiPrefs({ dateHeaderRows: 1 }).dateHeaderMode).toBe('day')
    expect(normalizeGanttUiPrefs({ dateHeaderRows: 2 }).dateHeaderMode).toBe('month_day')
    expect(normalizeGanttUiPrefs({ dateHeaderRows: 3 }).dateHeaderMode).toBe('year_month_day')
    expect(normalizeGanttUiPrefs({}).barStyle).toBe('fill')
    expect(normalizeGanttUiPrefs({ barStyle: 'outline' }).barStyle).toBe('outline')
    expect(normalizeGanttUiPrefs({ barStyle: 'hatch' }).barStyle).toBe('hatch')
  })

  it('drops legacy 完成百分比 custom column and stale percentComplete label', () => {
    const prefs = normalizeGanttUiPrefs({
      customColumns: [
        { id: 'custom:keep', label: '备注' },
        { id: 'custom:old', label: '完成百分比' },
      ],
      columnOrder: ['name', 'custom:old', 'custom:keep'],
      columnLabels: {
        percentComplete: '完成百分比',
        'custom:old': '完成百分比',
      },
    })
    expect(prefs.customColumns).toEqual([{ id: 'custom:keep', label: '备注' }])
    expect(prefs.columnOrder).toEqual(['name', 'custom:keep'])
    expect(prefs.columnLabels.percentComplete).toBeUndefined()
    expect(prefs.columnLabels['custom:old']).toBeUndefined()
  })

  it('clears stock zh/en builtin labels so locale i18n can apply', () => {
    const prefs = normalizeGanttUiPrefs({
      columnLabels: {
        index: '序号',
        name: '任务名称',
        start: '开始日期',
        finish: 'Finish Date',
        predecessors: 'Predecessors',
        // User rename — keep
        duration: 'Working Days',
      },
    })
    expect(prefs.columnLabels.index).toBeUndefined()
    expect(prefs.columnLabels.name).toBeUndefined()
    expect(prefs.columnLabels.start).toBeUndefined()
    expect(prefs.columnLabels.finish).toBeUndefined()
    expect(prefs.columnLabels.predecessors).toBeUndefined()
    expect(prefs.columnLabels.duration).toBe('Working Days')
  })

  it('resolveColumnLabel prefers i18n over stock Chinese overrides', () => {
    const label = resolveColumnLabel(
      'start',
      {
        ...normalizeGanttUiPrefs({}),
        columnLabels: { start: '开始日期' },
      },
      {
        index: 'No.',
        name: 'Task Name',
        duration: 'Duration',
        start: 'Start Date',
        finish: 'Finish Date',
        predecessors: 'Predecessors',
        actualStart: 'Actual Start Date',
        actualFinish: 'Actual Finish Date',
        shouldPercentComplete: 'Planned\nComplete',
        percentComplete: 'Actual\nComplete',
      },
    )
    expect(label).toBe('Start Date')
  })

  it('keeps a fixed 3-row date header height for all modes', () => {
    expect(dateHeaderHeight('day')).toBe(54)
    expect(dateHeaderHeight('week')).toBe(54)
    expect(dateHeaderHeight('year_month')).toBe(54)
    expect(dateHeaderHeight('year_month_day')).toBe(54)
    expect(dateHeaderHeight(1)).toBe(54)
  })
})
