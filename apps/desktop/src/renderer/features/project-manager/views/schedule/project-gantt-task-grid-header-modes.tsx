import type { ReactNode, MouseEvent } from 'react'

import { parseCostColumnId, makeCostColumnId } from './pm-gantt-cost-assignment'
import { parseResourceColumnId } from './pm-gantt-resource-assignment'
import type { GanttUiPrefs } from './pm-gantt-prefs'

type ModeArgs = {
  prefs: GanttUiPrefs
  t: (key: string) => string
  openHeaderMenu: (event: MouseEvent) => void
  costInputMode: boolean
  renderPlainHeaderCell: (columnId: string, options?: { rowSpan2?: boolean }) => ReactNode
}

export function renderGanttResourceViewHeader({
  prefs,
  t,
  openHeaderMenu,
  renderPlainHeaderCell,
}: ModeArgs): ReactNode[] {
  const order = prefs.columnOrder
  const nodes: ReactNode[] = []
  let index = 0
  while (index < order.length) {
    const columnId = order[index]!
    if (columnId === 'spacer') {
      nodes.push(
        <span
          key="spacer"
          className="tm-pm-gantt-col tm-pm-gantt-col--spacer"
          aria-hidden
          onContextMenu={openHeaderMenu}
        />,
      )
      index += 1
      continue
    }
    const parsed = parseResourceColumnId(columnId)
    if (parsed?.field === 'input') {
      nodes.push(
        <div
          key={columnId}
          className="tm-pm-gantt-resource-header-group tm-pm-gantt-resource-header-group--indexed"
          style={{ gridColumn: 'span 1' }}
          onContextMenu={openHeaderMenu}
        >
          <div className="tm-pm-gantt-resource-header-group-title">
            {t('projectManagerPage.schedule.columns.resourceGroup')}
          </div>
          <div
            className="tm-pm-gantt-resource-header-group-subs tm-pm-gantt-resource-header-group-subs--index"
            style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}
          >
            <span className="tm-pm-gantt-col tm-pm-gantt-col--sub tm-pm-gantt-col--resource-index">
              1
            </span>
          </div>
        </div>,
      )
      index += 1
      continue
    }
    if (parsed?.field === 'qty') {
      const qtyIds: string[] = []
      let cursor = index
      while (cursor < order.length) {
        const nextId = order[cursor]!
        const nextParsed = parseResourceColumnId(nextId)
        if (nextParsed?.field !== 'qty') break
        qtyIds.push(nextId)
        cursor += 1
      }
      const colCount = Math.max(1, qtyIds.length)
      nodes.push(
        <div
          key="resource-named-group"
          className="tm-pm-gantt-resource-header-group tm-pm-gantt-resource-header-group--indexed"
          style={{ gridColumn: `span ${colCount}` }}
          onContextMenu={openHeaderMenu}
        >
          <div className="tm-pm-gantt-resource-header-group-title">
            {t('projectManagerPage.schedule.columns.resourceGroup')}
          </div>
          <div
            className="tm-pm-gantt-resource-header-group-subs tm-pm-gantt-resource-header-group-subs--index"
            style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}
          >
            {qtyIds.map((qtyId, slotIndex) => (
              <span
                key={qtyId}
                className="tm-pm-gantt-col tm-pm-gantt-col--sub tm-pm-gantt-col--resource-index"
              >
                {slotIndex + 1}
              </span>
            ))}
          </div>
        </div>,
      )
      index = cursor
      continue
    }
    nodes.push(renderPlainHeaderCell(columnId, { rowSpan2: true }))
    index += 1
  }
  return nodes
}

export function renderGanttCostViewHeader({
  prefs,
  t,
  openHeaderMenu,
  costInputMode,
  renderPlainHeaderCell,
}: ModeArgs): ReactNode[] {
  const order = prefs.columnOrder
  const nodes: ReactNode[] = []
  let index = 0
  while (index < order.length) {
    const columnId = order[index]!
    if (columnId === 'spacer') {
      nodes.push(
        <span
          key="spacer"
          className={[
            'tm-pm-gantt-col',
            'tm-pm-gantt-col--spacer',
            costInputMode ? '' : 'tm-pm-gantt-col--rowspan2',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-hidden
          onContextMenu={openHeaderMenu}
        />,
      )
      index += 1
      continue
    }
    const parsed = parseCostColumnId(columnId)
    if (parsed?.field === 'input') {
      nodes.push(
        <span
          key={columnId}
          className={[
            'tm-pm-gantt-col',
            'tm-pm-gantt-col--costInput',
            costInputMode ? '' : 'tm-pm-gantt-col--rowspan2',
          ]
            .filter(Boolean)
            .join(' ')}
          onContextMenu={openHeaderMenu}
        >
          {t('projectManagerPage.schedule.columns.costGroup')}
        </span>,
      )
      index += 1
      continue
    }
    if (!costInputMode && parsed?.field === 'qty') {
      const qtyIds: string[] = []
      let cursor = index
      while (cursor < order.length) {
        const nextId = order[cursor]!
        const nextParsed = parseCostColumnId(nextId)
        if (nextParsed?.field !== 'qty') break
        qtyIds.push(nextId)
        cursor += 1
      }
      const colCount = Math.max(1, qtyIds.length)
      nodes.push(
        <div
          key="cost-named-group"
          className="tm-pm-gantt-resource-header-group tm-pm-gantt-resource-header-group--indexed"
          style={{ gridColumn: `span ${colCount}` }}
          onContextMenu={openHeaderMenu}
        >
          <div className="tm-pm-gantt-resource-header-group-title">
            {t('projectManagerPage.schedule.columns.costGroup')}
          </div>
          <div
            className="tm-pm-gantt-resource-header-group-subs tm-pm-gantt-resource-header-group-subs--index"
            style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}
          >
            {qtyIds.map((qtyId, slotIndex) => (
              <span
                key={qtyId}
                className="tm-pm-gantt-col tm-pm-gantt-col--sub tm-pm-gantt-col--resource-index"
              >
                {slotIndex + 1}
              </span>
            ))}
          </div>
        </div>,
      )
      index = cursor
      continue
    }
    if (
      !costInputMode &&
      parsed?.field === 'name' &&
      order[index + 1] === makeCostColumnId(parsed.slot, 'amount')
    ) {
      let colCount = 0
      let slotCount = 0
      let cursor = index
      while (cursor < order.length) {
        const nextId = order[cursor]!
        const nextParsed = parseCostColumnId(nextId)
        if (
          nextParsed?.field === 'name' &&
          order[cursor + 1] === makeCostColumnId(nextParsed.slot, 'amount')
        ) {
          colCount += 2
          slotCount += 1
          cursor += 2
          continue
        }
        break
      }
      if (slotCount > 0) {
        nodes.push(
          <div
            key={`cost-legacy-group-${index}`}
            className="tm-pm-gantt-resource-header-group tm-pm-gantt-resource-header-group--indexed"
            style={{ gridColumn: `span ${colCount}` }}
            onContextMenu={openHeaderMenu}
          >
            <div className="tm-pm-gantt-resource-header-group-title">
              {t('projectManagerPage.schedule.columns.costGroup')}
            </div>
            <div
              className="tm-pm-gantt-resource-header-group-subs tm-pm-gantt-resource-header-group-subs--index"
              style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: slotCount }, (_, slotIndex) => (
                <span
                  key={`cost-legacy-index-${index}-${slotIndex}`}
                  className="tm-pm-gantt-col tm-pm-gantt-col--sub tm-pm-gantt-col--resource-index"
                  style={{ gridColumn: 'span 2' }}
                >
                  {slotIndex + 1}
                </span>
              ))}
            </div>
          </div>,
        )
        index = cursor
        continue
      }
    }
    nodes.push(renderPlainHeaderCell(columnId, { rowSpan2: !costInputMode }))
    index += 1
  }
  return nodes
}
