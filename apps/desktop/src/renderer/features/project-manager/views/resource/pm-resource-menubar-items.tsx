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
import type { ResourceMenuAction, ResourceMenuItem } from './ProjectResourceMenuBarTypes'

const ICON_SIZE = 16

export function buildResourceMenuItems(input: {
  t: (key: string) => string
  canEdit: boolean
  hasProject: boolean
  canUndo: boolean
  canRedo: boolean
  hasSelection: boolean
}): ResourceMenuItem[] {
  const { t, canEdit, hasProject, canUndo, canRedo, hasSelection } = input
  return [
    {
      key: 'save',
      title: t('projectManagerPage.resourceTable.menu.save'),
      label: <IconSave size={ICON_SIZE} />,
      icon: true,
      disabled: !canEdit,
    },
    {
      key: 'saveAsNewVersion',
      title: t('projectManagerPage.resourceTable.menu.saveAsNewVersion'),
      label: <IconSaveAsNewVersion size={ICON_SIZE} />,
      icon: true,
      disabled: !canEdit,
    },
    {
      key: 'print',
      title: t('projectManagerPage.resourceTable.menu.print'),
      label: <IconPrint size={ICON_SIZE} />,
      icon: true,
    },
    {
      key: 'projectInfo',
      title: t('projectManagerPage.resourceTable.menu.projectInfo'),
      label: <IconProjectInfo size={ICON_SIZE} />,
      icon: true,
      disabled: !hasProject,
    },
    {
      key: 'undo',
      title: t('projectManagerPage.resourceTable.menu.undo'),
      label: <IconUndo size={ICON_SIZE} />,
      icon: true,
      disabled: !canUndo,
    },
    {
      key: 'redo',
      title: t('projectManagerPage.resourceTable.menu.redo'),
      label: <IconRedo size={ICON_SIZE} />,
      icon: true,
      disabled: !canRedo,
      dividerAfter: true,
    },
    {
      key: 'add',
      title: t('projectManagerPage.resourceTable.menu.add'),
      label: <IconPlus size={ICON_SIZE} />,
      icon: true,
      disabled: !canEdit,
    },
    {
      key: 'insert',
      title: t('projectManagerPage.resourceTable.menu.insert'),
      label: <IconInsertRow size={ICON_SIZE} />,
      icon: true,
      disabled: !canEdit || !hasSelection,
    },
    {
      key: 'delete',
      title: t('projectManagerPage.resourceTable.menu.delete'),
      label: <IconTrash size={ICON_SIZE} />,
      icon: true,
      disabled: !hasSelection,
      dividerAfter: true,
    },
    {
      key: 'indent',
      title: t('projectManagerPage.resourceTable.menu.indent'),
      label: <IconIndent size={ICON_SIZE} />,
      icon: true,
      disabled: !hasSelection,
    },
    {
      key: 'outdent',
      title: t('projectManagerPage.resourceTable.menu.outdent'),
      label: <IconOutdent size={ICON_SIZE} />,
      icon: true,
      disabled: !hasSelection,
    },
    {
      key: 'moveUp',
      title: t('projectManagerPage.resourceTable.menu.moveUp'),
      label: <IconChevronUp size={ICON_SIZE} />,
      disabled: !hasSelection,
      icon: true,
    },
    {
      key: 'moveDown',
      title: t('projectManagerPage.resourceTable.menu.moveDown'),
      label: <IconChevronDown size={ICON_SIZE} />,
      disabled: !hasSelection,
      icon: true,
    },
  ]
}

export function renderResourceToolbarItem(
  item: ResourceMenuItem,
  options: {
    disabled: boolean
    hideTip: () => void
    onAction: (action: ResourceMenuAction) => void
    tipProps: (title: string) => Record<string, unknown>
  },
) {
  const isDisabled = Boolean(options.disabled || item.disabled)
  return (
    <span key={item.key} className="tm-pm-resource-menubar-item">
      <button
        type="button"
        className={[
          'tm-pm-resource-menubar-btn',
          item.icon ? 'tm-pm-resource-menubar-btn--icon' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label={item.title}
        aria-disabled={isDisabled}
        onClick={() => {
          if (isDisabled) return
          options.hideTip()
          options.onAction(item.key)
        }}
        {...options.tipProps(item.title)}
      >
        {item.label}
      </button>
      {item.dividerAfter ? <span className="tm-pm-resource-menubar-divider" /> : null}
    </span>
  )
}
