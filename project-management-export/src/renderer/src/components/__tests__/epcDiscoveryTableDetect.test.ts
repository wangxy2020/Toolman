import { describe, expect, it } from 'vitest'

import { normalizeEpcStep1DiscoveryTableInContent } from '../epcDiscoveryTableDetect'

describe('normalizeEpcStep1DiscoveryTableInContent', () => {
  it('converts step 1 markdown pipe table to epc-discovery-table HTML', () => {
    const input = `# 进度款工程量数据统计-执行报告

### 步骤 1：多层穿透与匹配

intro

| 文件名 | 分类 | 说明 |
| --- | :---: | --- |
| a.xlsx | 待处理 | 很长的说明文字：账本 SUCCESS 但 aligned 已删除，将重新生成合并母表 |

**成功。** 统计

### 步骤 2：工程量清单分析
`
    const out = normalizeEpcStep1DiscoveryTableInContent(input)
    expect(out).toContain('class="epc-discovery-table"')
    expect(out).not.toMatch(/\| 文件名 \|/)
    expect(out).toContain('epc-discovery-queue')
    expect(out).toContain('很长的说明文字')
  })

  it('leaves non-workflow content unchanged', () => {
    const input = '| A | B |\n| - | - |\n| 1 | 2 |'
    expect(normalizeEpcStep1DiscoveryTableInContent(input)).toBe(input)
  })
})
