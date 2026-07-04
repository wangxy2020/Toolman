import { describe, expect, it } from 'vitest'

import { TaskEventSchema } from './events.js'

describe('TaskEventSchema', () => {
  it('parses task.started', () => {
    const event = TaskEventSchema.parse({
      type: 'task.started',
      taskId: '550e8400-e29b-41d4-a716-446655440000',
      workspaceId: '00000000-0000-0000-0000-000000000002',
      title: 'Demo',
      status: 'pending',
      timestamp: Date.now(),
    })
    expect(event.type).toBe('task.started')
  })

  it('parses task.artifact.created', () => {
    const event = TaskEventSchema.parse({
      type: 'task.artifact.created',
      taskId: '550e8400-e29b-41d4-a716-446655440000',
      workspaceId: '00000000-0000-0000-0000-000000000002',
      artifactId: '550e8400-e29b-41d4-a716-446655440001',
      name: 'Report',
      kind: 'report',
      absolutePath: '/tmp/report.md',
      timestamp: Date.now(),
    })
    expect(event.type).toBe('task.artifact.created')
    if (event.type === 'task.artifact.created') {
      expect(event.kind).toBe('report')
    }
  })

  it('parses task.finished', () => {
    const event = TaskEventSchema.parse({
      type: 'task.finished',
      taskId: '550e8400-e29b-41d4-a716-446655440000',
      workspaceId: '00000000-0000-0000-0000-000000000002',
      status: 'cancelled',
      timestamp: Date.now(),
    })
    expect(event.type).toBe('task.finished')
    if (event.type === 'task.finished') {
      expect(event.status).toBe('cancelled')
    }
  })
})
