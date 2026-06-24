import { describe, expect, it } from 'vitest'

import { INSTALL_STATUS_LABELS, USER_ROLE_LABELS } from './community-user-utils'

describe('community-user-utils', () => {
  it('labels user roles', () => {
    expect(USER_ROLE_LABELS.founder).toBe('超级管理员')
    expect(USER_ROLE_LABELS.admin).toBe('管理员')
    expect(USER_ROLE_LABELS.user).toBe('普通用户')
  })

  it('labels install statuses', () => {
    expect(INSTALL_STATUS_LABELS.success).toBe('成功')
    expect(INSTALL_STATUS_LABELS.pending).toBe('进行中')
  })
})
