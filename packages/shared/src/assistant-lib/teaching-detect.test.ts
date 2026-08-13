import { describe, expect, it } from 'vitest'
import {
  ASSISTANT_LIB_ASSISTANT_NAME,
  ASSISTANT_LIB_ASSISTANT_NAME_LEGACY,
  listAssistantLibDefaultClassroomIds,
  listDuplicateAssistantLibDefaultClassroomIds,
  listDuplicateAssistantLibGuideCourseIds,
  isAssistantLibAssistantName,
  isLegacyPerCourseTeachingAssistant,
  resolveAssistantLibTeachingRuntime,
} from './agent-link.js'
import {
  isAssistantLibBuiltinClassroomSession,
  isAssistantLibGuideCourseSession,
  looksLikeSocraticAnswerLeak,
  isTeachingAssistantParameters,
} from './teaching-detect.js'

describe('socratic referee heuristics', () => {
  it('flags explicit answer dumps', () => {
    expect(looksLikeSocraticAnswerLeak('正确答案是光合作用产生氧气。')).toBe(true)
  })

  it('allows short questions', () => {
    expect(looksLikeSocraticAnswerLeak('你觉得变量作用域会影响这个报错吗？')).toBe(false)
  })

  it('detects teaching assistants', () => {
    expect(isTeachingAssistantParameters({ teachingMode: 'socratic' })).toBe(true)
    expect(isTeachingAssistantParameters({ assistantLibPresetId: 'detective' })).toBe(true)
    expect(isTeachingAssistantParameters({})).toBe(false)
  })

  it('recognizes current and legacy assistant classroom names', () => {
    expect(isAssistantLibAssistantName(ASSISTANT_LIB_ASSISTANT_NAME)).toBe(true)
    for (const legacy of ASSISTANT_LIB_ASSISTANT_NAME_LEGACY) {
      expect(isAssistantLibAssistantName(legacy)).toBe(true)
    }
    expect(isAssistantLibAssistantName('其他助手')).toBe(false)
  })

  it('lists duplicate default classrooms for cleanup', () => {
    const assistantId = 'a1'
    const ids = listDuplicateAssistantLibDefaultClassroomIds(
      [
        {
          id: 'keep',
          assistantId,
          title: '默认课堂',
          createdAt: 1,
          metadata: { toolmanAssistantLib: { enabled: true, isDefaultClassroom: true } },
        },
        {
          id: 'drop',
          assistantId,
          title: '默认课堂',
          createdAt: 2,
          metadata: { toolmanAssistantLib: { enabled: true, isDefaultClassroom: true } },
        },
      ],
      assistantId,
    )
    expect(ids).toEqual(['drop'])
  })

  it('lists every default classroom for retirement', () => {
    const assistantId = 'a1'
    expect(
      listAssistantLibDefaultClassroomIds(
        [
          {
            id: 'keep',
            assistantId,
            title: '默认课堂',
            metadata: { toolmanAssistantLib: { enabled: true, isDefaultClassroom: true } },
          },
          {
            id: 'also',
            assistantId,
            title: '默认课堂',
            metadata: { toolmanAssistantLib: { enabled: true, isDefaultClassroom: true } },
          },
          {
            id: 'guide',
            assistantId,
            title: 'Toolman使用说明',
            metadata: { toolmanAssistantLib: { enabled: true, isGuideClassroom: true } },
          },
        ],
        assistantId,
      ),
    ).toEqual(['keep', 'also'])
  })

  it('recognizes the built-in Toolman usage-guide course', () => {
    const metadata = {
      toolmanAssistantLib: {
        enabled: true,
        presetId: 'toolman-guide',
        isGuideClassroom: true,
      },
    }
    expect(isAssistantLibGuideCourseSession(metadata)).toBe(true)
    expect(isAssistantLibBuiltinClassroomSession(metadata)).toBe(false)
    expect(
      isAssistantLibBuiltinClassroomSession({
        toolmanAssistantLib: {
          enabled: true,
          presetId: 'socratic-tutor',
          isDefaultClassroom: true,
        },
      }),
    ).toBe(true)
  })

  it('lists duplicate Toolman usage-guide courses for cleanup', () => {
    const assistantId = 'a1'
    const ids = listDuplicateAssistantLibGuideCourseIds(
      [
        {
          id: 'keep',
          assistantId,
          title: 'Toolman使用说明',
          createdAt: 1,
          metadata: { toolmanAssistantLib: { enabled: true, isGuideClassroom: true } },
        },
        {
          id: 'drop',
          assistantId,
          title: 'Toolman使用说明',
          createdAt: 2,
          metadata: { toolmanAssistantLib: { enabled: true, isGuideClassroom: true } },
        },
      ],
      assistantId,
    )
    expect(ids).toEqual(['drop'])
  })

  it('hides legacy per-course teaching agents from the shared agent model', () => {
    expect(
      isLegacyPerCourseTeachingAssistant({
        name: '苏格拉底导师',
        parameters: { teachingMode: 'socratic' },
      }),
    ).toBe(true)
    expect(
      isLegacyPerCourseTeachingAssistant({
        name: ASSISTANT_LIB_ASSISTANT_NAME,
        parameters: { teachingMode: 'socratic', assistantLibPresetId: 'assistant-lib' },
      }),
    ).toBe(false)
  })

  it('resolves teaching runtime from course session metadata', () => {
    const runtime = resolveAssistantLibTeachingRuntime({
      sessionMetadata: {
        toolmanAssistantLib: {
          enabled: true,
          presetId: 'detective',
          teachingMode: 'socratic',
          refereeEnabled: true,
          roleplayId: 'detective',
          learningLabel: '学习',
        },
      },
      assistantParameters: { teachingMode: 'open' },
    })
    expect(runtime.teachingMode).toBe('socratic')
    expect(runtime.roleplayId).toBe('detective')
    expect(runtime.courseSystemPrompt).toBeTruthy()
  })
})
