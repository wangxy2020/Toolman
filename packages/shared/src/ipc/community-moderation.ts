import { z } from 'zod'
import { TimestampSchema, UuidSchema } from './base.js'
import {
  CommunityReportReasonSchema,
  CommunityReportStatusSchema,
  CommunityReportTargetTypeSchema,
  CommunityResourceStatusSchema,
  CommunityResourceTypeSchema,
  CommunityTaskStatusSchema,
} from './community-enums.js'

// --- Moderation ---

export const CommunityModerationReportCreateInputSchema = z.object({
  targetType: CommunityReportTargetTypeSchema,
  targetId: UuidSchema,
  reason: CommunityReportReasonSchema,
  description: z.string().max(5000).optional(),
})
export type CommunityModerationReportCreateInput = z.infer<
  typeof CommunityModerationReportCreateInputSchema
>

export const CommunityModerationReportSchema = z.object({
  id: UuidSchema,
  reporterId: UuidSchema,
  targetType: CommunityReportTargetTypeSchema,
  targetId: UuidSchema,
  reason: CommunityReportReasonSchema,
  description: z.string(),
  status: CommunityReportStatusSchema,
  createdAt: TimestampSchema,
  resolvedAt: TimestampSchema.nullable().optional(),
  resolvedBy: UuidSchema.nullable().optional(),
})
export type CommunityModerationReport = z.infer<typeof CommunityModerationReportSchema>

export const CommunityModerationReportListInputSchema = z.object({
  status: CommunityReportStatusSchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
})
export type CommunityModerationReportListInput = z.infer<
  typeof CommunityModerationReportListInputSchema
>

export const CommunityModerationReportListOutputSchema = z.object({
  items: z.array(CommunityModerationReportSchema),
})
export type CommunityModerationReportListOutput = z.infer<
  typeof CommunityModerationReportListOutputSchema
>

export const CommunityModerationReportResolveInputSchema = z.object({
  reportId: UuidSchema,
  action: z.enum([
    'suspend_resource',
    'suspend_and_ban_author',
    'ban_user',
    'delete_comment',
    'cancel_task',
    'dismiss_report',
  ]),
  note: z.string().optional(),
})
export type CommunityModerationReportResolveInput = z.infer<
  typeof CommunityModerationReportResolveInputSchema
>

export const CommunityModerationResourceActionInputSchema = z.object({
  resourceId: UuidSchema,
  reason: z.string().optional(),
  note: z.string().optional(),
})
export type CommunityModerationResourceActionInput = z.infer<
  typeof CommunityModerationResourceActionInputSchema
>

export const CommunityModerationResourceActionOutputSchema = z.object({
  id: UuidSchema,
  title: z.string(),
  status: CommunityResourceStatusSchema,
})
export type CommunityModerationResourceActionOutput = z.infer<
  typeof CommunityModerationResourceActionOutputSchema
>

export const CommunityModerationUserBanInputSchema = z.object({
  userId: UuidSchema,
  durationHours: z.number().int().positive().optional(),
  reason: z.string().optional(),
})
export type CommunityModerationUserBanInput = z.infer<typeof CommunityModerationUserBanInputSchema>

export const CommunityModerationUserUnbanInputSchema = z.object({
  userId: UuidSchema,
})
export type CommunityModerationUserUnbanInput = z.infer<
  typeof CommunityModerationUserUnbanInputSchema
>

export const CommunityModerationDeviceUnbanInputSchema = z.object({
  deviceId: z.string().min(1),
})
export type CommunityModerationDeviceUnbanInput = z.infer<
  typeof CommunityModerationDeviceUnbanInputSchema
>

export const CommunityModerationLogSchema = z.object({
  id: UuidSchema,
  moderatorId: UuidSchema,
  action: z.string(),
  targetType: z.string(),
  targetId: UuidSchema,
  reason: z.string().nullable().optional(),
  metadataJson: z.record(z.unknown()),
  createdAt: TimestampSchema,
})
export type CommunityModerationLog = z.infer<typeof CommunityModerationLogSchema>

export const CommunityModerationLogsListInputSchema = z.object({
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
})
export type CommunityModerationLogsListInput = z.infer<
  typeof CommunityModerationLogsListInputSchema
>

export const CommunityModerationLogsListOutputSchema = z.object({
  items: z.array(CommunityModerationLogSchema),
})
export type CommunityModerationLogsListOutput = z.infer<
  typeof CommunityModerationLogsListOutputSchema
>

export const CommunityModerationScanResourceSchema = z.object({
  id: UuidSchema,
  title: z.string(),
  resourceType: CommunityResourceTypeSchema,
  status: CommunityResourceStatusSchema,
  authorId: UuidSchema,
  authorName: z.string(),
  createdAt: TimestampSchema,
})
export type CommunityModerationScanResource = z.infer<
  typeof CommunityModerationScanResourceSchema
>

export const CommunityModerationScanMessageSchema = z.object({
  id: UuidSchema,
  userId: UuidSchema,
  authorName: z.string(),
  body: z.string(),
  createdAt: TimestampSchema,
})
export type CommunityModerationScanMessage = z.infer<typeof CommunityModerationScanMessageSchema>

export const CommunityModerationScanTaskSchema = z.object({
  id: UuidSchema,
  title: z.string(),
  publisherId: UuidSchema,
  publisherName: z.string(),
  status: CommunityTaskStatusSchema,
  createdAt: TimestampSchema,
})
export type CommunityModerationScanTask = z.infer<typeof CommunityModerationScanTaskSchema>

export const CommunityDeviceKindSchema = z.enum(['desktop', 'mobile'])
export type CommunityDeviceKind = z.infer<typeof CommunityDeviceKindSchema>

export const CommunityModerationScanDeviceSchema = z.object({
  deviceId: z.string(),
  deviceName: z.string(),
  deviceKind: CommunityDeviceKindSchema,
  userId: UuidSchema,
  userName: z.string(),
  lastSeenAt: TimestampSchema,
})
export type CommunityModerationScanDevice = z.infer<typeof CommunityModerationScanDeviceSchema>

export const CommunityModerationScanBannedUserSchema = z.object({
  userId: UuidSchema,
  displayName: z.string(),
  bannedUntil: TimestampSchema.nullable().optional(),
  bannedAt: TimestampSchema,
})
export type CommunityModerationScanBannedUser = z.infer<
  typeof CommunityModerationScanBannedUserSchema
>

export const CommunityModerationScanBannedDeviceSchema = z.object({
  deviceId: z.string(),
  deviceName: z.string(),
  userId: UuidSchema,
  userName: z.string(),
  reason: z.string().nullable().optional(),
  bannedAt: TimestampSchema,
  bannedUntil: TimestampSchema.nullable().optional(),
})
export type CommunityModerationScanBannedDevice = z.infer<
  typeof CommunityModerationScanBannedDeviceSchema
>

export const CommunityModerationDeviceBanInputSchema = z.object({
  deviceId: z.string().min(1),
  userId: UuidSchema,
  deviceName: z.string(),
  durationHours: z.number().int().positive().optional(),
  reason: z.string().optional(),
})
export type CommunityModerationDeviceBanInput = z.infer<
  typeof CommunityModerationDeviceBanInputSchema
>

export const CommunityModerationScanOutputSchema = z.object({
  scannedAt: TimestampSchema,
  onlineKnowledgeCount: z.number().int().nonnegative(),
  onlineMcpCount: z.number().int().nonnegative(),
  onlineSkillCount: z.number().int().nonnegative(),
  onlineWorkflowCount: z.number().int().nonnegative(),
  onlineDesktopDeviceCount: z.number().int().nonnegative(),
  onlineMobileDeviceCount: z.number().int().nonnegative(),
  openReportCount: z.number().int().nonnegative(),
  pendingReviewCount: z.number().int().nonnegative(),
  boardMessageCount: z.number().int().nonnegative(),
  activeTaskCount: z.number().int().nonnegative(),
  onlineResources: z.array(CommunityModerationScanResourceSchema),
  onlineDesktopDevices: z.array(CommunityModerationScanDeviceSchema),
  onlineMobileDevices: z.array(CommunityModerationScanDeviceSchema),
  openReports: z.array(CommunityModerationReportSchema),
  pendingReview: z.array(CommunityModerationScanResourceSchema),
  pendingReviewTasks: z.array(CommunityModerationScanTaskSchema).default([]),
  recentMessages: z.array(CommunityModerationScanMessageSchema),
  activeTasks: z.array(CommunityModerationScanTaskSchema),
  bannedUsers: z.array(CommunityModerationScanBannedUserSchema).default([]),
  bannedDevices: z.array(CommunityModerationScanBannedDeviceSchema).default([]),
})
export type CommunityModerationScanOutput = z.infer<typeof CommunityModerationScanOutputSchema>
