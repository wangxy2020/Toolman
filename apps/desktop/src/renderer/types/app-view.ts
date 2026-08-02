export type AppView =
  | 'agent'
  | 'knowledge'
  | 'notes'
  | 'workflow'
  | 'group'
  | 'community'
  | 'projects'
  | 'translate'
  | 'assistant-lib'
  | 'settings'

export type ModuleView = Exclude<AppView, 'agent' | 'settings'>

export const MODULE_VIEWS: ModuleView[] = [
  'knowledge',
  'notes',
  'workflow',
  'group',
  'community',
  'projects',
  'translate',
  'assistant-lib',
]

export function isModuleView(view: AppView): view is ModuleView {
  return MODULE_VIEWS.includes(view as ModuleView)
}
