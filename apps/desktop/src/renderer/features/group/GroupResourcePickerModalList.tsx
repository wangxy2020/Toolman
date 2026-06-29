import { IconChevronRight } from '../../components/icons'
import { GroupPickerCheckbox } from './group-resource-picker-modal-components'
import { groupPickerItemKey } from './group-resource-picker-modal-utils'
import type { GroupPickerGroup } from './group-resource-picker-types'
import type { UseGroupResourcePickerModalResult } from './useGroupResourcePickerModal'

type GroupResourcePickerModalListProps = Pick<
  UseGroupResourcePickerModalResult,
  | 't'
  | 'expandedIds'
  | 'selectedKeys'
  | 'getSelectableItems'
  | 'isGroupFullySelected'
  | 'isGroupPartiallySelected'
  | 'toggleGroup'
  | 'toggleItem'
  | 'toggleExpanded'
> & {
  groups: GroupPickerGroup[]
  loadingGroupId?: string | null
}

export function GroupResourcePickerModalList({
  t,
  groups,
  loadingGroupId = null,
  expandedIds,
  selectedKeys,
  getSelectableItems,
  isGroupFullySelected,
  isGroupPartiallySelected,
  toggleGroup,
  toggleItem,
  toggleExpanded,
}: GroupResourcePickerModalListProps) {
  return (
    <div className="tm-group-resource-picker-scroll">
      <ul className="tm-group-resource-picker-list">
        {groups.map((group) => {
          const expanded = expandedIds.has(group.id)
          const fullySelected = isGroupFullySelected(group)
          const partiallySelected = isGroupPartiallySelected(group)
          const selectableItems = getSelectableItems(group)

          return (
            <li
              key={group.id}
              className={[
                'tm-group-resource-picker-group',
                group.disabled ? 'tm-group-resource-picker-group--disabled' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className="tm-group-resource-picker-group-header">
                <button
                  type="button"
                  className="tm-group-resource-picker-expand"
                  aria-expanded={expanded}
                  onClick={() => toggleExpanded(group.id)}
                >
                  <IconChevronRight open={expanded} />
                </button>
                <button
                  type="button"
                  className="tm-group-resource-picker-group-main"
                  disabled={group.disabled}
                  onClick={() => toggleExpanded(group.id)}
                >
                  <span className="tm-group-resource-picker-group-name">{group.name}</span>
                  {group.description ? (
                    <span className="tm-group-resource-picker-group-desc">{group.description}</span>
                  ) : null}
                </button>
                <GroupPickerCheckbox
                  checked={fullySelected}
                  indeterminate={partiallySelected}
                  disabled={
                    group.disabled ||
                    (selectableItems.length === 0 &&
                      (group.items.length > 0
                        ? !group.groupSelectable
                        : !group.groupSelectable || (group.selectableCount ?? 0) === 0))
                  }
                  onChange={() => toggleGroup(group)}
                />
              </div>

              {expanded ? (
                <ul className="tm-group-resource-picker-items">
                  {loadingGroupId === group.id ? (
                    <li className="tm-group-resource-picker-item tm-group-resource-picker-item--loading">
                      {t('groupPage.picker.loading')}
                    </li>
                  ) : group.items.length === 0 ? (
                    <li className="tm-group-resource-picker-item tm-group-resource-picker-item--empty">
                      {t('groupPage.picker.noSubItems')}
                    </li>
                  ) : (
                    group.items.map((item) => {
                      const checked = selectedKeys.has(groupPickerItemKey(group.id, item.id))
                      if (item.displayOnly) {
                        return (
                          <li
                            key={item.id}
                            className="tm-group-resource-picker-item tm-group-resource-picker-item--display-only"
                          >
                            <div className="tm-group-resource-picker-item-main">
                              <span className="tm-group-resource-picker-item-name">{item.name}</span>
                              {item.meta ? (
                                <span className="tm-group-resource-picker-item-meta">{item.meta}</span>
                              ) : null}
                            </div>
                          </li>
                        )
                      }

                      return (
                        <li
                          key={item.id}
                          className={[
                            'tm-group-resource-picker-item',
                            item.disabled ? 'tm-group-resource-picker-item--disabled' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          <button
                            type="button"
                            className="tm-group-resource-picker-item-main"
                            disabled={item.disabled || group.disabled}
                            onClick={() => toggleItem(group.id, item.id)}
                          >
                            <span className="tm-group-resource-picker-item-name">{item.name}</span>
                            {item.meta ? (
                              <span className="tm-group-resource-picker-item-meta">{item.meta}</span>
                            ) : null}
                          </button>
                          <GroupPickerCheckbox
                            small
                            checked={checked}
                            disabled={item.disabled || group.disabled}
                            onChange={() => toggleItem(group.id, item.id)}
                          />
                        </li>
                      )
                    })
                  )}
                </ul>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
