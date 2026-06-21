import { describe, expect, it } from 'vitest'
import { EmailScene, SceneType } from 'authing-js-sdk'

import {
  resolveAuthingEmailScene,
  resolveAuthingSmsScene,
} from './authing-otp-auth.service.js'

describe('resolveAuthingEmailScene', () => {
  it('uses register scene for registration', () => {
    expect(resolveAuthingEmailScene('register')).toBe(EmailScene.REGISTER_VERIFY_CODE)
  })

  it('uses reset scene for password reset', () => {
    expect(resolveAuthingEmailScene('reset')).toBe(EmailScene.ResetPassword)
  })

  it('uses login scene for login', () => {
    expect(resolveAuthingEmailScene('login')).toBe(EmailScene.LOGIN_VERIFY_CODE)
    expect(resolveAuthingEmailScene(undefined)).toBe(EmailScene.LOGIN_VERIFY_CODE)
  })
})

describe('resolveAuthingSmsScene', () => {
  it('uses register scene for registration', () => {
    expect(resolveAuthingSmsScene('register')).toBe(SceneType.SCENE_TYPE_REGISTER)
  })

  it('uses reset scene for password reset', () => {
    expect(resolveAuthingSmsScene('reset')).toBe(SceneType.SCENE_TYPE_RESET)
  })

  it('uses login scene for login', () => {
    expect(resolveAuthingSmsScene('login')).toBe(SceneType.SCENE_TYPE_LOGIN)
    expect(resolveAuthingSmsScene(undefined)).toBe(SceneType.SCENE_TYPE_LOGIN)
  })
})
