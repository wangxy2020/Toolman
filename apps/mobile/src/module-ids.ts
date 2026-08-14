/** Module ids used across mobile UI (translate kept for settings / future). */
export type MobileModuleId =
  | 'agent'
  | 'knowledge'
  | 'notes'
  | 'translate'
  | 'group'
  | 'community'
  | 'classroom'
  | 'projects'

/** Top-bar module order (翻译不在顶栏). */
export const TOP_NAV_MODULE_IDS = [
  'agent',
  'knowledge',
  'notes',
  'group',
  'community',
  'classroom',
  'projects',
] as const satisfies ReadonlyArray<Exclude<MobileModuleId, 'translate'>>

export type TopNavModuleId = (typeof TOP_NAV_MODULE_IDS)[number]
