import { describe, expect, it } from 'vitest'

import {
  ALL_DATABASE_ROW_FILTER,
  encodeDatabaseRowFilterSelect,
  formatDatabaseRowFilterLabel,
  matchesDatabaseRowFilter,
  parseDatabaseRowFilterSelect,
  toggleDatabaseRowFilterValue,
} from './pm-cost-row-filter'

describe('toggleDatabaseRowFilterValue', () => {
  it('adds and removes values independently per dimension', () => {
    const withKisada = toggleDatabaseRowFilterValue(ALL_DATABASE_ROW_FILTER, 'subprojects', 'Kisada')
    expect(withKisada).toEqual({ subprojects: ['Kisada'], sectionalWorks: [] })
    const withBothSubs = toggleDatabaseRowFilterValue(withKisada, 'subprojects', 'Iringa')
    expect(withBothSubs.subprojects).toEqual(['Kisada', 'Iringa'])
    const withSchedule = toggleDatabaseRowFilterValue(withBothSubs, 'sectionalWorks', 'Schedule1')
    expect(withSchedule).toEqual({
      subprojects: ['Kisada', 'Iringa'],
      sectionalWorks: ['Schedule1'],
    })
    expect(toggleDatabaseRowFilterValue(withSchedule, 'subprojects', 'Kisada')).toEqual({
      subprojects: ['Iringa'],
      sectionalWorks: ['Schedule1'],
    })
  })
})

describe('matchesDatabaseRowFilter', () => {
  const row = { subproject: 'Kisada', sectionalWork: 'Schedule1' }

  it('keeps every row when no condition is set', () => {
    expect(matchesDatabaseRowFilter(row, ALL_DATABASE_ROW_FILTER)).toBe(true)
  })

  it('ORs values inside one dimension and ANDs the two dimensions', () => {
    expect(
      matchesDatabaseRowFilter(row, { subprojects: ['Kisada', 'Iringa'], sectionalWorks: [] }),
    ).toBe(true)
    expect(
      matchesDatabaseRowFilter(row, { subprojects: ['Iringa'], sectionalWorks: [] }),
    ).toBe(false)
    expect(
      matchesDatabaseRowFilter(row, {
        subprojects: ['Kisada'],
        sectionalWorks: ['Schedule1', 'Schedule4'],
      }),
    ).toBe(true)
    expect(
      matchesDatabaseRowFilter(row, {
        subprojects: ['Kisada'],
        sectionalWorks: ['Schedule4'],
      }),
    ).toBe(false)
  })
})

describe('formatDatabaseRowFilterLabel', () => {
  it('lists selected 子项目 and 分部工程 in option order', () => {
    expect(
      formatDatabaseRowFilterLabel(
        { subprojects: ['Iringa', 'Kisada'], sectionalWorks: ['Schedule4', 'Schedule1'] },
        {
          allLabel: '全部',
          optionLabel: (value) => value || '未分类',
          subprojectOptions: ['Kisada', 'Iringa'],
          sectionalOptions: ['Schedule1', 'Schedule2', 'Schedule3', 'Schedule4'],
        },
      ),
    ).toBe('Kisada、Iringa · Schedule1、Schedule4')
  })

  it('returns 全部 when nothing is selected', () => {
    expect(
      formatDatabaseRowFilterLabel(ALL_DATABASE_ROW_FILTER, {
        allLabel: '全部',
        optionLabel: (value) => value,
      }),
    ).toBe('全部')
  })
})

describe('encode/parse header select', () => {
  it('round-trips a single condition', () => {
    const filter = parseDatabaseRowFilterSelect('subproject\u001fKisada')
    expect(filter).toEqual({ subprojects: ['Kisada'], sectionalWorks: [] })
    expect(encodeDatabaseRowFilterSelect(filter)).toBe('subproject\u001fKisada')
  })

  it('encodes multi-condition as all so a native select stays valid', () => {
    expect(
      encodeDatabaseRowFilterSelect({
        subprojects: ['Kisada'],
        sectionalWorks: ['Schedule1'],
      }),
    ).toBe('all')
  })
})
