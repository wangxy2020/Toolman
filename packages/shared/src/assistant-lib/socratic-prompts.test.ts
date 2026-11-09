import { describe, expect, it } from 'vitest'
import {
  buildSocraticKnowledgeHint,
  buildSocraticKnowledgeSearchQuery,
  buildSocraticModeRuntimeHint,
  getAssistantLibPreset,
} from './socratic-prompts.js'

describe('buildSocraticKnowledgeSearchQuery', () => {
  it('prefers the current syllabus chapter over a bare user reply', () => {
    const query = buildSocraticKnowledgeSearchQuery('我觉得就是导电吧', {
      courseName: '化学',
      groupTitle: '物质及其变化',
      title: '第一节 物质的分类及转化',
      lessonPlan: '区分物理变化与化学变化；理解电离与导电。',
    })
    expect(query).toContain('化学')
    expect(query).toContain('物质及其变化')
    expect(query).toContain('第一节 物质的分类及转化')
    expect(query).toContain('电离与导电')
    expect(query).toContain('我觉得就是导电吧')
  })
})

describe('buildSocraticKnowledgeHint', () => {
  it('requires questions to stay on the current chapter', () => {
    const hint = buildSocraticKnowledgeHint(
      [
        {
          documentTitle: '教材',
          kbName: '化学',
          score: 0.9,
          text: '电离是电解质在水溶液中或熔融状态下产生自由移动离子的过程。',
        },
      ],
      '我觉得就是导电吧',
      {
        title: '第一节 物质的分类及转化',
        groupTitle: '物质及其变化',
      },
    )
    expect(hint).toContain('当前必须考查的章节')
    expect(hint).toContain('第一节 物质的分类及转化')
    expect(hint).toContain('只使用与当前大纲章节相关的片段')
    expect(hint).toContain('先点明本章正在讨论的概念名称')
  })
})

describe('buildSocraticModeRuntimeHint', () => {
  it('forbids leaving the chapter topic', () => {
    const hint = buildSocraticModeRuntimeHint('tutor')
    expect(hint).toContain('所有反问必须围绕该章教案')
    expect(hint).toContain('不得另起主题')
  })
})

describe('socratic tutor preset', () => {
  it('anchors the opening to the syllabus chapter', () => {
    const preset = getAssistantLibPreset('socratic-tutor')
    expect(preset?.systemPrompt).toContain('紧扣教学大纲当前章节')
    expect(preset?.systemPrompt).toContain('问题要让人听得懂')
    expect(preset?.systemPrompt).toContain('当前大纲章节')
  })
})
