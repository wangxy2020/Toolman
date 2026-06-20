import { describe, expect, it } from 'vitest'

import {
  clearToolApprovalScope,
  grantToolApprovalScope,
  hasToolApprovalScope,
} from './tool-approval.service'

describe('tool approval scopes', () => {
  it('tracks granted scopes per generation', () => {
    const scope = 'docx-mcp:test-message'
    expect(hasToolApprovalScope(scope)).toBe(false)
    grantToolApprovalScope(scope)
    expect(hasToolApprovalScope(scope)).toBe(true)
    clearToolApprovalScope(scope)
    expect(hasToolApprovalScope(scope)).toBe(false)
  })
})
