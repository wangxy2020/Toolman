import { IconChevronRight, IconTrash } from '../../components/icons'
import { GroupFileSelectCheckbox } from './GroupFileSelectCheckbox'

interface Props {
  expanded: boolean
  displayName: string
  documentCount: number
  showSectionActions: boolean
  canRemoveFromGroup: boolean
  canRemoveSaved: boolean
  canSelect: boolean
  sectionRemoveTitle: string
  sectionRemoveDisabled: boolean
  sectionFullySelected: boolean
  sectionPartiallySelected: boolean
  onToggleExpanded: () => void
  onSectionRemove: () => void
  onToggleSelectSection: () => void
}

export function GroupSharedKnowledgeSectionHeader({
  expanded,
  displayName,
  documentCount,
  showSectionActions,
  canRemoveFromGroup,
  canRemoveSaved,
  canSelect,
  sectionRemoveTitle,
  sectionRemoveDisabled,
  sectionFullySelected,
  sectionPartiallySelected,
  onToggleExpanded,
  onSectionRemove,
  onToggleSelectSection,
}: Props) {
  return (
    <header className="tm-group-kb-section-header">
      <button
        type="button"
        className="tm-group-kb-section-expand"
        aria-expanded={expanded}
        onClick={onToggleExpanded}
      >
        <IconChevronRight open={expanded} />
      </button>

      <button type="button" className="tm-group-kb-section-heading" onClick={onToggleExpanded}>
        <h3 className="tm-group-kb-section-title">{displayName}</h3>
        <p className="tm-group-kb-section-meta">{documentCount} 篇文档</p>
      </button>

      {showSectionActions ? (
        <div className="tm-group-kb-section-actions">
          {(canRemoveFromGroup || canRemoveSaved) ? (
            <button
              type="button"
              className="tm-kb-file-card-action tm-kb-file-card-action--danger"
              title={sectionRemoveTitle}
              disabled={sectionRemoveDisabled}
              onClick={onSectionRemove}
            >
              <IconTrash size={16} />
            </button>
          ) : null}
          {canSelect ? (
            <GroupFileSelectCheckbox
              checked={sectionFullySelected}
              title={sectionPartiallySelected ? '部分选中' : '选择知识库内全部文件'}
              onChange={onToggleSelectSection}
            />
          ) : null}
        </div>
      ) : null}
    </header>
  )
}
