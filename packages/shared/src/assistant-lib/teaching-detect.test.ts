import { describe, expect, it } from 'vitest'
import {
  ASSISTANT_LIB_ASSISTANT_NAME,
  ASSISTANT_LIB_ASSISTANT_NAME_LEGACY,
  listAssistantLibDefaultClassroomIds,
  listDuplicateAssistantLibGuideCourseIds,
  isAssistantLibAssistantName,
  isLegacyPerCourseTeachingAssistant,
  resolveAssistantLibTeachingRuntime,
  resolveCanonicalAssistantLibAssistant,
} from './agent-link.js'
import {
  assistantLibSessionMetadataPatch,
  isAssistantLibGuideCourseSession,
  looksLikeSocraticAnswerLeak,
  isTeachingAssistantParameters,
  parseAssistantLibSessionMeta,
  resolveEffectiveChatTts,
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

  it('picks the classroom agent that owns the latest course topic', () => {
    const assistants = [
      { id: 'old', name: '课堂' },
      { id: 'new', name: '课堂' },
    ]
    const sessions = [
      {
        assistantId: 'old',
        updatedAt: 1,
        metadata: {
          toolmanAssistantLib: {
            enabled: true,
            presetId: 'socratic-tutor',
            learningLabel: '学习',
          },
        },
      },
      {
        assistantId: 'new',
        updatedAt: 9,
        metadata: {
          toolmanAssistantLib: {
            enabled: true,
            presetId: 'socratic-tutor',
            learningLabel: '学习',
            modelId: 'prov:deepseek-flash',
          },
        },
      },
    ]
    expect(resolveCanonicalAssistantLibAssistant(assistants, sessions)?.id).toBe('new')
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

  it('clears legacy per-course modelId when patched empty', () => {
    const metadata = {
      toolmanAssistantLib: {
        enabled: true,
        presetId: 'socratic-tutor',
        learningLabel: '学习',
        modelId: 'prov:gpt-4o-mini',
      },
    }
    const kept = assistantLibSessionMetadataPatch(metadata, {
      presetId: 'socratic-tutor',
      courseName: 'Rust',
    })
    expect(parseAssistantLibSessionMeta(kept)?.modelId).toBe('prov:gpt-4o-mini')
    const cleared = assistantLibSessionMetadataPatch(metadata, {
      presetId: 'socratic-tutor',
      modelId: '',
    })
    expect(parseAssistantLibSessionMeta(cleared)?.modelId).toBeUndefined()
  })

  it('preserves autoSpeak / tts settings when a syllabus patch omits them', () => {
    const metadata = {
      toolmanAssistantLib: {
        enabled: true,
        presetId: 'socratic-tutor',
        learningLabel: '学习',
        autoSpeak: true,
        ttsEngine: 'edge' as const,
        ttsVoice: 'zh-CN-XiaoxiaoNeural',
      },
    }
    const kept = assistantLibSessionMetadataPatch(metadata, {
      presetId: 'socratic-tutor',
      courseName: '化学',
    })
    const meta = parseAssistantLibSessionMeta(kept)
    expect(meta?.autoSpeak).toBe(true)
    expect(meta?.ttsEngine).toBe('edge')
    expect(meta?.ttsVoice).toBe('zh-CN-XiaoxiaoNeural')
  })

  it('prefers course autoSpeak over agent autoSpeak', () => {
    const courseOn = resolveEffectiveChatTts({
      sessionMetadata: {
        toolmanAssistantLib: {
          enabled: true,
          presetId: 'socratic-tutor',
          learningLabel: '学习',
          autoSpeak: true,
        },
      },
      assistantAutoSpeak: false,
    })
    expect(courseOn.autoSpeak).toBe(true)

    const courseOff = resolveEffectiveChatTts({
      sessionMetadata: {
        toolmanAssistantLib: {
          enabled: true,
          presetId: 'socratic-tutor',
          learningLabel: '学习',
          autoSpeak: false,
        },
      },
      assistantAutoSpeak: true,
    })
    expect(courseOff.autoSpeak).toBe(false)
  })

  it('falls back to agent autoSpeak when topic is not a course', () => {
    expect(
      resolveEffectiveChatTts({
        sessionMetadata: { foo: 1 },
        assistantAutoSpeak: true,
      }).autoSpeak,
    ).toBe(true)
    expect(
      resolveEffectiveChatTts({
        sessionMetadata: null,
        assistantAutoSpeak: false,
      }).autoSpeak,
    ).toBe(false)
  })

  it('reads course autoSpeak even when strict meta parse fails', () => {
    const resolved = resolveEffectiveChatTts({
      sessionMetadata: {
        toolmanAssistantLib: {
          enabled: true,
          presetId: 'socratic-tutor',
          learningLabel: '学习',
          autoSpeak: true,
          // Invalid kb id should fail strict schema, not TTS resolution.
          kbIds: ['not-a-uuid'],
        },
      },
      assistantAutoSpeak: false,
    })
    expect(resolved.autoSpeak).toBe(true)
  })

})
