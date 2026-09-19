import { describe, expect, it } from 'vitest'
import { buildKnowledgeSystemHint } from './agent-runtime.service'

const GAPPY_CHUNK = [
  '【第 31 页】',
  '## 第2    析中的 本因素 的因素   的因素',
  '在   中  们 据   析家 希望达到的目的   了  概念和  料',
  '四个 本因素    析的目的就是回答 或  回答  非常  的',
  '人的因素 或多或少 人的因素总要参 到 中  中  要  的方',
  '统 言  的因素的 析要  的因素容  多  的因素数  限',
  '内在稳定 是 要的 的因素  析家  的因素就是内在 稳定',
  '投 资  的  本  因 素  和  的  因 素  大 类',
].join('\n')

describe('buildKnowledgeSystemHint', () => {
  it('warns when retrieved chunks are a broken CJK scan layer', () => {
    const hint = buildKnowledgeSystemHint(
      [
        {
          documentTitle: '《证券分析》本杰明•格雷厄姆.pdf',
          kbName: '默认文件夹',
          score: 0.8,
          text: GAPPY_CHUNK,
        },
      ],
      '检查并分析一下证券分析第二章标题和主要内容？',
    )
    expect(hint).toContain('不是「未索引」')
    expect(hint).toContain('**禁止**用训练数据')
  })
})
