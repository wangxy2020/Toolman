import { describe, expect, it } from 'vitest'

import {
  detectCostImportFormat,
  draftsToCostRows,
  mapHeaderToField,
  parseDelimitedCostTable,
  parseXmlCostDocument,
  resolveImportCostType,
} from './pm-cost-import'

describe('pm-cost-import', () => {
  it('detects budget formats by extension', () => {
    expect(detectCostImportFormat('list.xlsx')).toBe('excel')
    expect(detectCostImportFormat('list.CSV')).toBe('csv')
    expect(detectCostImportFormat('bid.xml')).toBe('xml')
    expect(detectCostImportFormat('unit.gbq4')).toBe('gbq')
    expect(detectCostImportFormat('project.gzb4')).toBe('gzb')
    expect(detectCostImportFormat('bid.gtb4')).toBe('gtb')
    expect(detectCostImportFormat('qty.gtj')).toBe('gtj')
  })

  it('maps chinese and english headers', () => {
    expect(mapHeaderToField('工作名称')).toBe('name')
    expect(mapHeaderToField('项目编码')).toBe('code')
    expect(mapHeaderToField('特征描述')).toBe('featureDescription')
    expect(mapHeaderToField('分部工程')).toBe('sectionalWork')
    expect(mapHeaderToField('Unit Price')).toBe('unitPrice')
  })

  it('parses csv tables into cost drafts', () => {
    const csv = [
      '编码,名称,单位,数量,单价,分部工程,类型',
      '010101,挖土方,m3,100,25.5,土建,综合单价',
      '010102,回填,m3,80,18,土建,材料',
    ].join('\n')
    const drafts = parseDelimitedCostTable(csv)
    expect(drafts).toHaveLength(2)
    expect(drafts[0]).toMatchObject({
      code: '010101',
      name: '挖土方',
      unit: 'm3',
      quantity: 100,
      unitPrice: 25.5,
      sectionalWork: '土建',
      type: 'comprehensive',
    })
    expect(drafts[1]?.type).toBe('material')
    const rows = draftsToCostRows(drafts, 'all')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.applicable).toBe('all')
    expect(rows[0]?.name).toBe('挖土方')
  })

  it('parses bidding-style xml items', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Project>
  <清单项目>
    <编码>010201</编码>
    <名称>砖墙</名称>
    <单位>m3</单位>
    <数量>12.5</数量>
    <单价>680</单价>
    <分部工程>砌筑</分部工程>
  </清单项目>
  <清单项目>
    <项目编码>010202</项目编码>
    <项目名称>混凝土</项目名称>
    <计量单位>m3</计量单位>
    <工程量>30</工程量>
    <综合单价>920</综合单价>
  </清单项目>
</Project>`
    const drafts = parseXmlCostDocument(xml)
    expect(drafts).toHaveLength(2)
    expect(drafts[0]).toMatchObject({
      code: '010201',
      name: '砖墙',
      quantity: 12.5,
      unitPrice: 680,
      sectionalWork: '砌筑',
    })
    expect(drafts[1]?.name).toBe('混凝土')
    expect(drafts[1]?.code).toBe('010202')
  })

  it('resolves type labels', () => {
    expect(resolveImportCostType('综合单价')).toBe('comprehensive')
    expect(resolveImportCostType('材料')).toBe('material')
    expect(resolveImportCostType('unknown-type')).toBe('comprehensive')
  })
})
