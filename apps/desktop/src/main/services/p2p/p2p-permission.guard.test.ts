import { describe, expect, it } from 'vitest'
import { P2pPermissionError } from './p2p-permission.guard'

describe('P2pPermissionError', () => {
  it('uses a stable error name', () => {
    const error = new P2pPermissionError('只读成员无法执行此操作')
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('P2pPermissionError')
    expect(error.message).toBe('只读成员无法执行此操作')
  })
})
