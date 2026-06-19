import { z } from 'zod'

export const SkillInfoSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  description: z.string().max(512),
  builtin: z.boolean(),
  sourcePath: z.string().optional(),
  hasContent: z.boolean(),
})

export type SkillInfo = z.infer<typeof SkillInfoSchema>

export const SkillListOutputSchema = z.object({
  items: z.array(SkillInfoSchema),
})

export const SkillInstallInputSchema = z.object({
  sourcePath: z.string().min(1).max(4096),
})

export const SkillDeleteInputSchema = z.object({
  id: z.string().min(1).max(64),
})

export const SkillDeleteOutputSchema = z.object({
  deleted: z.boolean(),
})
