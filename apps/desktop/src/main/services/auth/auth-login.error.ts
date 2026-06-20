export class AuthLoginError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'AuthLoginError'
  }
}
