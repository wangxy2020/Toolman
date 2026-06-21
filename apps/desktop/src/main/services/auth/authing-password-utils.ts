import { AuthLoginError } from './auth-login.error.js'

export function assertMatchingPasswords(password: string, confirmPassword: string): void {
  if (password !== confirmPassword) {
    throw new AuthLoginError('两次输入的密码不一致')
  }
}

export function assertValidPasswordLength(password: string, minLength = 6): void {
  if (password.trim().length < minLength) {
    throw new AuthLoginError(`密码至少 ${minLength} 位`)
  }
}
