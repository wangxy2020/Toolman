import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, join } from 'node:path'
import { app } from 'electron'
import {
  BUILTIN_SKILLS,
  BUILTIN_SKILL_IDS,
  SkillDeleteInputSchema,
  SkillInfoSchema,
  SkillInstallInputSchema,
  type SkillInfo,
} from '@toolman/shared'

const SKILL_FILE = 'SKILL.md'

const BUILTIN_SKILL_CONTENT: Record<(typeof BUILTIN_SKILL_IDS)[number], string> = {
  'find-skills': `---
name: 发现技能
description: 当用户询问「怎么做 X」「有没有能做 X 的技能」或想扩展智能体能力时，帮助发现并安装合适的技能。
---

# 发现技能

当用户询问如何做某件事、想查找技能，或问是否存在某种能力时：

1. 用一段话澄清用户的目标与限制条件。
2. 先在已安装技能中查找（参见系统上下文中的已挂载技能部分）。
3. 若没有合适的已安装技能，建议使用 \`skill-creator\` 创建，或从包含 \`SKILL.md\` 的本地文件夹安装。
4. 说明该技能能做什么，以及用户如何在 Toolman 设置中安装或启用。
`,
  'skill-creator': `---
name: 技能创建器
description: 创建新技能、修改并改进现有技能。适用于用户想从零编写技能、编辑或更新已有技能的场景。
---

# 技能创建器

当用户想要创建、编辑或改进 Agent Skill 时使用本技能。

## 工作流程

1. 理解任务、触发条件和期望输出。
2. 起草 \`SKILL.md\`，包含 YAML 前言（\`name\`、\`description\`）和简洁的操作说明。
3. 保持技能聚焦，建议每个技能只对应一个工作流。
4. 告知用户将文件夹保存到 Toolman 技能目录，或通过 **设置 → 技能 → 添加** 安装。
5. 安装后，在智能体的 **技能** 标签页中启用该技能。

## SKILL.md 模板

\`\`\`markdown
---
name: my-skill
description: 何时使用本技能（第三人称，包含触发短语）。
---

# 我的技能

智能体按步骤执行的说明...
\`\`\`
`,
}

function skillsRoot(): string {
  const dir = join(app.getPath('userData'), 'skills')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function sanitizeSkillId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

function parseSkillMarkdown(content: string): {
  meta: Record<string, string>
  body: string
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { meta: {}, body: content.trim() }

  const meta: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf(':')
    if (idx <= 0) continue
    meta[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim()
  }

  return { meta, body: match[2].trim() }
}

function readSkillFile(skillDir: string): { meta: Record<string, string>; body: string } | null {
  const skillPath = join(skillDir, SKILL_FILE)
  if (!existsSync(skillPath)) return null
  try {
    return parseSkillMarkdown(readFileSync(skillPath, 'utf8'))
  } catch {
    return null
  }
}

function isBuiltinSkillId(id: string): boolean {
  return (BUILTIN_SKILL_IDS as readonly string[]).includes(id)
}

function buildSkillInfo(id: string, skillDir: string): SkillInfo | null {
  const parsed = readSkillFile(skillDir)
  if (!parsed) return null

  const builtin = isBuiltinSkillId(id)
  const fallback = BUILTIN_SKILLS.find((skill) => skill.id === id)
  const name = parsed.meta.name?.trim() || fallback?.name || id
  const description =
    parsed.meta.description?.trim() || fallback?.description || parsed.body.split('\n')[0] || id
  const hasContent = Boolean(parsed.body.trim())

  return SkillInfoSchema.parse({
    id,
    name,
    description,
    builtin,
    sourcePath: skillDir,
    hasContent,
  })
}

export function ensureBuiltinSkills(): void {
  const root = skillsRoot()
  for (const skill of BUILTIN_SKILLS) {
    const dir = join(root, skill.id)
    const skillPath = join(dir, SKILL_FILE)
    mkdirSync(dir, { recursive: true })
    writeFileSync(skillPath, BUILTIN_SKILL_CONTENT[skill.id], 'utf8')
  }
}

export function listSkills(): SkillInfo[] {
  ensureBuiltinSkills()
  const root = skillsRoot()
  const items: SkillInfo[] = []

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const info = buildSkillInfo(entry.name, join(root, entry.name))
    if (info) items.push(info)
  }

  return items.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

export function getSkillContent(skillId: string): string | null {
  ensureBuiltinSkills()
  const skillDir = join(skillsRoot(), skillId)
  const parsed = readSkillFile(skillDir)
  if (!parsed) return null
  return parsed.body.trim() || null
}

export function getSkillInfo(skillId: string): SkillInfo | null {
  ensureBuiltinSkills()
  const skillDir = join(skillsRoot(), skillId)
  if (!existsSync(skillDir)) return null
  return buildSkillInfo(skillId, skillDir)
}

export function installSkillFromDirectory(input: unknown): SkillInfo {
  const { sourcePath } = SkillInstallInputSchema.parse(input)
  if (!existsSync(sourcePath)) {
    throw new Error('所选文件夹不存在')
  }
  if (!statSync(sourcePath).isDirectory()) {
    throw new Error('请选择一个包含 SKILL.md 的文件夹')
  }

  const sourceSkillPath = join(sourcePath, SKILL_FILE)
  if (!existsSync(sourceSkillPath)) {
    throw new Error('文件夹中未找到 SKILL.md')
  }

  const parsed = parseSkillMarkdown(readFileSync(sourceSkillPath, 'utf8'))
  const folderName = sanitizeSkillId(basename(sourcePath))
  const id = sanitizeSkillId(parsed.meta.name || folderName)
  if (!id) {
    throw new Error('无法从 SKILL.md 解析有效的技能 ID')
  }

  if (isBuiltinSkillId(id)) {
    throw new Error('该 ID 为内置技能保留')
  }

  const targetDir = join(skillsRoot(), id)
  if (existsSync(targetDir)) {
    rmSync(targetDir, { recursive: true, force: true })
  }
  cpSync(sourcePath, targetDir, { recursive: true })

  const info = buildSkillInfo(id, targetDir)
  if (!info) {
    throw new Error('安装失败：SKILL.md 无效')
  }
  return info
}

export function deleteSkill(input: unknown): boolean {
  const { id } = SkillDeleteInputSchema.parse(input)
  if (isBuiltinSkillId(id)) {
    throw new Error('内置技能不可删除')
  }

  const targetDir = join(skillsRoot(), id)
  if (!existsSync(targetDir)) return false
  rmSync(targetDir, { recursive: true, force: true })
  return true
}

export function filterEnabledSkillIds(skillIds: string[]): string[] {
  const known = new Set(listSkills().map((skill) => skill.id))
  return skillIds.filter((id) => known.has(id))
}
