import { userProfileAuthZhCN } from './user/profile-auth.zh-CN'
import { userProfileAuthEn } from './user/profile-auth.en'
import { userAccountZhCN } from './user/account.zh-CN'
import { userAccountEn } from './user/account.en'
import { userMembershipZhCN } from './user/membership.zh-CN'
import { userMembershipEn } from './user/membership.en'
import { userMetaZhCN } from './user/meta.zh-CN'
import { userMetaEn } from './user/meta.en'

export const userZhCN = {
  ...userProfileAuthZhCN,
  ...userAccountZhCN,
  ...userMembershipZhCN,
  ...userMetaZhCN,
} as const

export const userEn = {
  ...userProfileAuthEn,
  ...userAccountEn,
  ...userMembershipEn,
  ...userMetaEn,
} as const
