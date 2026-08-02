import { describe, expect, it } from 'vitest'
import {
  extractCourseOutlineFromText,
  extractOutlineFromTocSection,
  flattenPdfOutline,
  isCourseOutlineNoiseTitle,
  resolveCourseOutline,
} from './extract-course-outline'

describe('isCourseOutlineNoiseTitle', () => {
  it('drops front-matter titles including 封面 / 目录', () => {
    expect(isCourseOutlineNoiseTitle('封面')).toBe(true)
    expect(isCourseOutlineNoiseTitle('目录')).toBe(true)
    expect(isCourseOutlineNoiseTitle('封面.pdf')).toBe(true)
    expect(isCourseOutlineNoiseTitle('【目录】')).toBe(true)
    expect(isCourseOutlineNoiseTitle('目 录')).toBe(true)
    expect(isCourseOutlineNoiseTitle('Contents')).toBe(true)
    expect(isCourseOutlineNoiseTitle('第一章 写作规律')).toBe(false)
  })

  it('strips PDF.js NUL suffixes on bookmark titles', () => {
    expect(isCourseOutlineNoiseTitle('封面\u0000')).toBe(true)
    expect(isCourseOutlineNoiseTitle('目录\u0000')).toBe(true)
    expect(isCourseOutlineNoiseTitle('第1章 写作规律\u0000')).toBe(false)
  })
})

describe('extractCourseOutlineFromText', () => {
  it('extracts Chinese chapter headings', () => {
    const text = `
小说写作教程

第一章 构思与题材
正文……

第二章 人物塑造
更多正文

第三节 对话技巧
`
    const outline = extractCourseOutlineFromText(text)
    expect(outline.map((item) => item.title)).toEqual([
      '第一章 构思与题材',
      '第二章 人物塑造',
      '第三节 对话技巧',
    ])
  })

  it('extracts markdown headings', () => {
    const outline = extractCourseOutlineFromText('# Intro\n\n## Setup\n\nbody\n\n## Build\n')
    expect(outline.map((item) => item.title)).toEqual(['Intro', 'Setup', 'Build'])
  })
})

describe('flattenPdfOutline', () => {
  it('flattens nested bookmarks to depth 2', () => {
    const outline = flattenPdfOutline([
      {
        title: '第一章',
        items: [{ title: '1.1 开篇', items: [{ title: '过深' }] }],
      },
      { title: '第二章', items: [] },
    ])
    expect(outline.map((item) => item.title)).toEqual(['第一章', '1.1 开篇', '第二章'])
  })

  it('drops 封面 and 目录 bookmarks', () => {
    const outline = flattenPdfOutline([
      { title: '封面' },
      { title: '目录', items: [{ title: '第一章 写作规律' }] },
      { title: '第二章 人物' },
    ])
    expect(outline.map((item) => item.title)).toEqual(['第一章 写作规律', '第二章 人物'])
  })

  it('drops PDF.js NUL-suffixed 封面 / 目录 bookmarks', () => {
    const outline = flattenPdfOutline([
      { title: '封面\u0000' },
      { title: '目录\u0000' },
      { title: '第1章 写作规律\u0000' },
    ])
    expect(outline.map((item) => item.title)).toEqual(['第1章 写作规律'])
  })
})

describe('extractOutlineFromTocSection', () => {
  it('extracts Chinese TOC entries with leader dots and page numbers', () => {
    const text = `
小说写作教程

目录
第一章 构思与题材 ················· 1
第二章 人物塑造 .................... 23
一、角色小传 ························ 25
第三节 对话技巧 ………… 40

前言
这是正文开头，很长的一段说明文字。
`
    const outline = extractOutlineFromTocSection(text)
    expect(outline.map((item) => item.title)).toEqual([
      '第一章 构思与题材',
      '第二章 人物塑造',
      '一、角色小传',
      '第三节 对话技巧',
    ])
  })
})

describe('resolveCourseOutline', () => {
  it('prefers pdf bookmarks when rich enough', () => {
    const outline = resolveCourseOutline({
      pdfOutline: [{ title: '开篇导读' }, { title: '人物塑造' }],
      plainText: '目录\n第一章 忽略 ··· 1\n第二章 忽略 ··· 2\n',
    })
    expect(outline.map((item) => item.title)).toEqual(['开篇导读', '人物塑造'])
  })

  it('prefers in-body TOC over scattered headings', () => {
    const outline = resolveCourseOutline({
      pdfOutline: [{ title: 'OnlyOne' }],
      plainText: `
目录
第一章 甲篇 …… 1
第二章 乙篇 …… 9

第一章 甲篇
正文里重复的章节标题不应优先。
第二章 乙篇
更多正文
`,
    })
    expect(outline.map((item) => item.title)).toEqual(['第一章 甲篇', '第二章 乙篇'])
  })
})
