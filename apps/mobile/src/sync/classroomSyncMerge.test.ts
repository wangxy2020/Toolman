import { describe, expect, it } from 'vitest'
import {
  applyClassroomCoursesToSessions,
  mergeClassroomCoursesFromSyncChanges,
} from './classroomSyncMerge'

describe('mergeClassroomCoursesFromSyncChanges', () => {
  it('upserts a classroom course from changelog payload', () => {
    const merged = mergeClassroomCoursesFromSyncChanges([], [
      {
        entityKind: 'classroom_session',
        entityId: 'c1',
        op: 'upsert',
        updatedAt: 20,
        payload: {
          title: 'Rust 入门',
          meta: {
            enabled: true,
            presetId: 'socratic-tutor',
            learningLabel: '学习',
            teachingMode: 'socratic',
            courseName: 'Rust 入门',
            studyRecords: [{ id: 'r1', startedAt: 1, mastered: [], stuckPoints: [], qaCount: 2 }],
            syllabus: { generation: 'ready', generatedCount: 1, chapters: [] },
          },
        },
      },
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0]?.courseName).toBe('Rust 入门')
    expect(merged[0]?.teachingMode).toBe('socratic')
    expect(merged[0]?.studyRecords).toHaveLength(1)
  })

  it('keeps a per-course model id from changelog payload', () => {
    const merged = mergeClassroomCoursesFromSyncChanges([], [
      {
        entityKind: 'classroom_session',
        entityId: 'c1',
        op: 'upsert',
        updatedAt: 20,
        payload: {
          title: 'Rust 入门',
          meta: {
            enabled: true,
            presetId: 'socratic-tutor',
            learningLabel: '学习',
            modelId: 'deepseek:deepseek-v4-flash',
          },
        },
      },
    ])
    expect(merged[0]?.modelId).toBe('deepseek:deepseek-v4-flash')
  })

  it('keeps a local model id when the incoming payload omits it', () => {
    const merged = mergeClassroomCoursesFromSyncChanges(
      [
        {
          id: 'c1',
          title: 'Rust 入门',
          updatedAt: 10,
          courseName: 'Rust 入门',
          presetId: 'socratic-tutor',
          teachingMode: 'socratic',
          refereeEnabled: false,
          customSystemPrompt: '',
          lessonPlan: '',
          syllabus: null,
          studyRecords: [],
          socraticState: null,
          isGuideClassroom: false,
          isDefaultClassroom: false,
          modelId: 'moonshot:kimi-k2.6',
          autoSpeak: false,
        },
      ],
      [
        {
          entityKind: 'classroom_session',
          entityId: 'c1',
          op: 'upsert',
          updatedAt: 20,
          payload: {
            title: 'Rust 入门',
            meta: {
              enabled: true,
              presetId: 'socratic-tutor',
              learningLabel: '学习',
            },
          },
        },
      ],
    )
    expect(merged[0]?.modelId).toBe('moonshot:kimi-k2.6')
    expect(merged[0]?.autoSpeak).toBe(false)
  })

  it('keeps the newer local course on stale delete', () => {
    const merged = mergeClassroomCoursesFromSyncChanges(
      [
        {
          id: 'c1',
          title: 'Keep',
          updatedAt: 50,
          courseName: 'Keep',
          presetId: 'open',
          teachingMode: 'open',
          refereeEnabled: false,
          customSystemPrompt: '',
          lessonPlan: '',
          syllabus: null,
          studyRecords: [],
          socraticState: null,
          isGuideClassroom: false,
          isDefaultClassroom: false,
        },
      ],
      [
        {
          entityKind: 'classroom_session',
          entityId: 'c1',
          op: 'delete',
          updatedAt: 10,
          payload: {},
        },
      ],
    )
    expect(merged).toHaveLength(1)
    expect(merged[0]?.title).toBe('Keep')
  })
})

describe('applyClassroomCoursesToSessions', () => {
  it('upserts synced courses and drops leftover classroom topics', () => {
    const next = applyClassroomCoursesToSessions(
      [
        { id: 'local', title: '新话题', updatedAt: 1, agentScope: 'classroom' },
        { id: 'c1', title: '旧名', updatedAt: 2, agentScope: 'classroom' },
        { id: 'agent', title: '智能体', updatedAt: 3, agentScope: 'agent' },
      ],
      ['c1', 'gone'],
      [
        {
          id: 'c1',
          title: 'Rust 入门',
          updatedAt: 30,
          courseName: 'Rust 入门',
          presetId: 'socratic-tutor',
          teachingMode: 'socratic',
          refereeEnabled: false,
          customSystemPrompt: '',
          lessonPlan: '',
          syllabus: null,
          studyRecords: [],
          socraticState: null,
          isGuideClassroom: false,
          isDefaultClassroom: false,
        },
      ],
      (course) => ({
        id: course.id,
        title: course.courseName,
        updatedAt: course.updatedAt,
        agentScope: 'classroom',
      }),
    )
    expect(next.map((item) => item.id)).toEqual(['c1', 'agent'])
    expect(next.find((item) => item.id === 'c1')?.title).toBe('Rust 入门')
    expect(next.some((item) => item.id === 'local')).toBe(false)
  })
})
