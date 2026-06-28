import { describe, expect, it, afterEach } from 'vitest'

import {
  computeGuestDocumentsFolderSlug,
  deriveFolderSlugFromAccountLabel,
  deriveFolderSlugFromAuthSubject,
  GUEST_DOCUMENTS_FOLDER_SLUG,
} from './documents-folder-slug.service'
import {
  DEFAULT_LOCAL_IDENTITY_ID,
  P2P_DEV_USER_B_IDENTITY_ID,
} from './local-identity'

describe('documents folder slug derivation', () => {
  afterEach(() => {
    delete process.env.TOOLMAN_DEV_IDENTITY_ID
    delete process.env.TOOLMAN_DOCS_ROOT
    delete process.env.TOOLMAN_DOCS_USER_SLUG
  })

  it('uses email local-part as folder slug', () => {
    expect(deriveFolderSlugFromAccountLabel('wxymale@126.com')).toBe('wxymale')
  })

  it('uses phone digits as folder slug', () => {
    expect(deriveFolderSlugFromAuthSubject('tencent_phone', '+8613800138000')).toBe('8613800138000')
  })

  it('sanitizes invalid path characters', () => {
    expect(deriveFolderSlugFromAccountLabel('user/name@test.com')).toBe('user-name')
  })

  it('derives slug from masked phone binding metadata email', () => {
    expect(deriveFolderSlugFromAccountLabel('31897124@qq.com')).toBe('31897124')
  })

  it('uses 本地用户 for unlogged-in users regardless of display name', () => {
    expect(GUEST_DOCUMENTS_FOLDER_SLUG).toBe('本地用户')
    expect(computeGuestDocumentsFolderSlug()).toBe('本地用户')
  })

  it('uses distinct guest folders for dev dual-instance without isolated docs root', () => {
    process.env.TOOLMAN_DEV_IDENTITY_ID = DEFAULT_LOCAL_IDENTITY_ID
    expect(computeGuestDocumentsFolderSlug(DEFAULT_LOCAL_IDENTITY_ID)).toBe('本地用户-a')

    process.env.TOOLMAN_DEV_IDENTITY_ID = P2P_DEV_USER_B_IDENTITY_ID
    expect(computeGuestDocumentsFolderSlug(P2P_DEV_USER_B_IDENTITY_ID)).toBe('本地用户-b')
  })

  it('uses 本地用户 when each dev instance has its own TOOLMAN_DOCS_ROOT', () => {
    process.env.TOOLMAN_DEV_IDENTITY_ID = DEFAULT_LOCAL_IDENTITY_ID
    process.env.TOOLMAN_DOCS_ROOT = '/tmp/toolman-p2p-a-docs'
    // No identity row in test DB — falls back to 本地用户
    expect(computeGuestDocumentsFolderSlug(DEFAULT_LOCAL_IDENTITY_ID)).toBe('本地用户')

    process.env.TOOLMAN_DEV_IDENTITY_ID = P2P_DEV_USER_B_IDENTITY_ID
    process.env.TOOLMAN_DOCS_ROOT = '/tmp/toolman-p2p-b-docs'
    expect(computeGuestDocumentsFolderSlug(P2P_DEV_USER_B_IDENTITY_ID)).toBe('本地用户')
  })

  it('supports TOOLMAN_DOCS_USER_SLUG override', () => {
    process.env.TOOLMAN_DOCS_USER_SLUG = 'test-user-folder'
    expect(computeGuestDocumentsFolderSlug()).toBe('test-user-folder')
  })
})
