import {
  deleteSkill,
  ensureBuiltinSkills,
  installSkillFromDirectory,
  listSkills,
} from './skill.service'

export function bootstrapSkills(): void {
  ensureBuiltinSkills()
}

export function listInstalledSkills() {
  return { items: listSkills() }
}

export function installSkill(input: unknown) {
  return installSkillFromDirectory(input)
}

export function removeSkill(input: unknown) {
  return { deleted: deleteSkill(input) }
}
