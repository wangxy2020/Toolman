import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  isStockCostColumnLabel,
  loadCostColumnLabels,
  saveCostColumnLabels,
} from './pm-cost-column-prefs'

describe('pm-cost-column-prefs labels', () => {
  const LEGACY_KEY = 'toolman.pm.cost.columnLabels'
  let store: Map<string, string>

  beforeEach(() => {
    store = new Map()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value)
        },
        removeItem: (key: string) => {
          store.delete(key)
        },
      },
    })
  })

  afterEach(() => {
    store.clear()
  })

  it('treats current and previous built-in headers as stock', () => {
    expect(isStockCostColumnLabel('type', '类型')).toBe(true)
    expect(isStockCostColumnLabel('type', 'Type')).toBe(true)
    expect(isStockCostColumnLabel('type', 'Categories')).toBe(true)
    expect(isStockCostColumnLabel('sectionalWork', '分部工程')).toBe(true)
    expect(isStockCostColumnLabel('sectionalWork', 'Sectional work')).toBe(true)
    expect(isStockCostColumnLabel('sectionalWork', 'Subproject')).toBe(true)
    expect(isStockCostColumnLabel('sectionalWork', 'Subdivision Work')).toBe(true)
    expect(isStockCostColumnLabel('subproject', '子项目')).toBe(true)
    expect(isStockCostColumnLabel('subproject', 'Subproject')).toBe(true)
    expect(isStockCostColumnLabel('code', '编码')).toBe(true)
    expect(isStockCostColumnLabel('code', 'Code')).toBe(true)
    expect(isStockCostColumnLabel('code', 'No')).toBe(true)
    expect(isStockCostColumnLabel('name', 'Work name')).toBe(true)
    expect(isStockCostColumnLabel('name', 'Work Name')).toBe(true)
    expect(isStockCostColumnLabel('featureDescription', 'Feature description')).toBe(true)
    expect(isStockCostColumnLabel('featureDescription', 'Description')).toBe(true)
    expect(isStockCostColumnLabel('totalPrice', 'Amount')).toBe(true)
    expect(isStockCostColumnLabel('totalPrice', 'Amount (CNY)')).toBe(true)
    expect(isStockCostColumnLabel('totalPrice', 'Total Price')).toBe(true)
    expect(isStockCostColumnLabel('type', '分类')).toBe(false)
    expect(isStockCostColumnLabel('priorQuantity', '往期完成工程量')).toBe(true)
    expect(isStockCostColumnLabel('priorQuantity', '前期完成工程量')).toBe(true)
    expect(isStockCostColumnLabel('periodQuantity', '本期完成工程量')).toBe(true)
  })

  it('does not let a frozen Chinese header override English defaults', () => {
    store.set(
      LEGACY_KEY,
      JSON.stringify({
        type: '类型',
        sectionalWork: '分部工程',
        code: '编码',
        name: '分类名',
      }),
    )

    expect(loadCostColumnLabels('en')).toEqual({})
    expect(loadCostColumnLabels('zh-CN')).toEqual({ name: '分类名' })
  })

  it('ignores previously saved English stock headers so i18n can update', () => {
    store.set(
      `${LEGACY_KEY}.en`,
      JSON.stringify({
        type: 'Type',
        sectionalWork: 'Sectional work',
        code: 'Code',
      }),
    )

    expect(loadCostColumnLabels('en')).toEqual({})
  })

  it('keeps true custom labels per locale and does not persist stock text', () => {
    saveCostColumnLabels(
      {
        type: 'Categories',
        code: 'Job no',
      },
      'en',
    )

    expect(JSON.parse(store.get(`${LEGACY_KEY}.en`) ?? '{}')).toEqual({ code: 'Job no' })
    expect(loadCostColumnLabels('en')).toEqual({ code: 'Job no' })
    expect(loadCostColumnLabels('zh-CN')).toEqual({})
  })
})
