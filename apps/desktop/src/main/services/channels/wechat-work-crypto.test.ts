import { describe, expect, it } from 'vitest'
import { readXmlTag } from './wechat-work-crypto.js'

describe('readXmlTag', () => {
  it('reads CDATA and plain xml tags', () => {
    const xml = '<xml><MsgType><![CDATA[text]]></MsgType><Content>hello</Content></xml>'
    expect(readXmlTag(xml, 'MsgType')).toBe('text')
    expect(readXmlTag(xml, 'Content')).toBe('hello')
  })
})
