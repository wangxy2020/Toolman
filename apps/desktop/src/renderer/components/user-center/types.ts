export type ViewMode = 'login' | 'register' | 'profile' | 'forgot_password'

export type ProfileSubView =
  | 'main'
  | 'change_password'
  | 'bind_phone'
  | 'bind_wechat'
  | 'upgrade_membership'

export type UserCenterSuccessBehavior = 'close' | 'profile'
