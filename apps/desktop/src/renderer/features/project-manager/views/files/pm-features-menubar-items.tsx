import {
  IconChevronDown,
  IconChevronUp,
  IconIndent,
  IconInsertRow,
  IconOutdent,
  IconPlus,
  IconPrint,
  IconProjectInfo,
  IconRedo,
  IconSave,
  IconSaveAsNewVersion,
  IconTrash,
  IconUndo,
} from '../../../../components/icons'
import type {
  FeaturesMenuAction,
  FeaturesMenuItem,
  FeaturesViewFilter,
} from './ProjectFeaturesMenuBarTypes'

const ICON_SIZE = 16

export function buildFeaturesMenuItems(input: {
  t: (key: string) => string
  canEdit: boolean
  hasProject: boolean
  canUndo: boolean
  canRedo: boolean
  hasSelection: boolean
  selectedType?: FeaturesViewFilter
}): FeaturesMenuItem[] {
  const { t, canEdit, hasProject, canUndo, canRedo, hasSelection, selectedType } = input
  return [
    {
      key: 'save',
      title: t('projectManagerPage.files.menu.save'),
      label: <IconSave size={ICON_SIZE} />,
      icon: true,
      disabled: !canEdit,
    },
    {
      key: 'saveAsNewVersion',
      title: t('projectManagerPage.files.menu.saveAsNewVersion'),
      label: <IconSaveAsNewVersion size={ICON_SIZE} />,
      icon: true,
      disabled: !canEdit,
    },
    {
      key: 'print',
      title: t('projectManagerPage.files.menu.print'),
      label: <IconPrint size={ICON_SIZE} />,
      icon: true,
    },
    {
      key: 'projectInfo',
      title: t('projectManagerPage.files.menu.projectInfo'),
      label: <IconProjectInfo size={ICON_SIZE} />,
      icon: true,
      disabled: !hasProject,
    },
    {
      key: 'undo',
      title: t('projectManagerPage.files.menu.undo'),
      label: <IconUndo size={ICON_SIZE} />,
      icon: true,
      disabled: !canUndo,
    },
    {
      key: 'redo',
      title: t('projectManagerPage.files.menu.redo'),
      label: <IconRedo size={ICON_SIZE} />,
      icon: true,
      disabled: !canRedo,
      dividerAfter: true,
    },
    {
      key: 'add',
      title: t('projectManagerPage.files.menu.add'),
      label: <IconPlus size={ICON_SIZE} />,
      icon: true,
      disabled: !canEdit,
    },
    {
      key: 'insert',
      title: t('projectManagerPage.files.menu.insert'),
      label: <IconInsertRow size={ICON_SIZE} />,
      icon: true,
      disabled: !canEdit || !hasSelection,
    },
    {
      key: 'delete',
      title: t('projectManagerPage.files.menu.delete'),
      label: <IconTrash size={ICON_SIZE} />,
      icon: true,
      disabled: !hasSelection,
      dividerAfter: true,
    },
    {
      key: 'indent',
      title: t('projectManagerPage.files.menu.indent'),
      label: <IconIndent size={ICON_SIZE} />,
      icon: true,
      disabled: !hasSelection,
    },
    {
      key: 'outdent',
      title: t('projectManagerPage.files.menu.outdent'),
      label: <IconOutdent size={ICON_SIZE} />,
      icon: true,
      disabled: !hasSelection,
      dividerAfter: true,
    },
    {
      key: 'moveUp',
      title: t('projectManagerPage.files.menu.moveUp'),
      label: <IconChevronUp size={ICON_SIZE} />,
      icon: true,
      disabled: !hasSelection,
    },
    {
      key: 'moveDown',
      title: t('projectManagerPage.files.menu.moveDown'),
      label: <IconChevronDown size={ICON_SIZE} />,
      icon: true,
      disabled: !hasSelection,
      dividerAfter: true,
    },
    {
      key: 'procurement',
      title: t('projectManagerPage.files.menu.procurement'),
      label: t('projectManagerPage.files.menu.procurement'),
      active: selectedType === 'procurement',
    },
    {
      key: 'node',
      title: t('projectManagerPage.files.menu.node'),
      label: t('projectManagerPage.files.menu.node'),
      active: selectedType === 'node',
    },
    {
      key: 'funds',
      title: t('projectManagerPage.files.menu.funds'),
      label: t('projectManagerPage.files.menu.funds'),
      active: selectedType === 'funds',
    },
  ]
}

export function renderFeaturesToolbarItem(
  item: FeaturesMenuItem,
  options: {
    disabled: boolean
    hideTip: () => void
    onAction: (action: FeaturesMenuAction) => void
    tipProps: (text: string) => Record<string, unknown>
  },
) {
  const { disabled, hideTip, onAction, tipProps } = options
  const isDisabled = Boolean(disabled || item.disabled)
  return (
    <span key={item.key} className="tm-pm-features-menubar-item">
      <button
        type="button"
        className={[
          'tm-pm-features-menubar-btn',
          item.icon ? 'tm-pm-features-menubar-btn--icon' : '',
          item.active ? 'tm-pm-features-menubar-btn--active' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label={item.title}
        aria-disabled={isDisabled}
        aria-pressed={item.active ? true : undefined}
        onClick={() => {
          if (isDisabled) return
          hideTip()
          onAction(item.key)
        }}
        {...tipProps(item.title)}
      >
        {item.label}
      </button>
      {item.dividerAfter ? <span className="tm-pm-features-menubar-divider" /> : null}
    </span>
  )
}
