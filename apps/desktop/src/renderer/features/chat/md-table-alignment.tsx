import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'
import { renderMarkdownHtmlBreaks } from './markdown-html-breaks'

function normalizeHeaderLabel(value: string): string {
  return value.trim().replace(/\s+/g, '').toLowerCase()
}

function extractTextContent(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractTextContent).join('')
  if (!isValidElement<{ children?: ReactNode }>(node)) return ''
  return extractTextContent(node.props.children)
}

const SERIAL_COLUMN_PATTERN = /^(序号|编号|序|no\.?|#|index|id)$/
const QUANTITY_COLUMN_PATTERN = /^(数量|数目|个数|件数|qty|quantity|count)$/

/** Progress-plan WBS table emitted by the plan agent. */
export function isPmPlanTableHeaders(headers: string[]): boolean {
  const normalized = headers.map((header) => normalizeHeaderLabel(header))
  return (
    normalized.some((header) => header.includes('层级')) &&
    normalized.some((header) => header.includes('任务名称') || header.includes('任务名'))
  )
}

export function getCenterAlignedColumnIndexes(headers: string[]): Set<number> {
  const normalized = headers.map((header) => normalizeHeaderLabel(header))

  if (isPmPlanTableHeaders(headers)) {
    const indexes = new Set<number>()
    normalized.forEach((header, index) => {
      if (
        header.includes('层级') ||
        header.includes('工期') ||
        header.includes('开始') ||
        header.includes('完成') ||
        header.includes('结束')
      ) {
        indexes.add(index)
      }
    })
    return indexes
  }

  const hasSerial = normalized.some((header) => SERIAL_COLUMN_PATTERN.test(header))
  const hasQuantity = normalized.some((header) => QUANTITY_COLUMN_PATTERN.test(header))
  if (!hasSerial || !hasQuantity) return new Set()

  const indexes = new Set<number>()
  normalized.forEach((header, index) => {
    if (SERIAL_COLUMN_PATTERN.test(header) || QUANTITY_COLUMN_PATTERN.test(header)) {
      indexes.add(index)
    }
  })
  return indexes
}

function extractTableHeaders(children: ReactNode): string[] {
  const headers: string[] = []

  Children.forEach(children, (section) => {
    if (!isValidElement<{ children?: ReactNode }>(section)) return
    if (section.type !== 'thead') return

    Children.forEach(section.props.children, (row) => {
      if (!isValidElement<{ children?: ReactNode }>(row)) return
      Children.forEach(row.props.children, (cell) => {
        if (!isValidElement<{ children?: ReactNode }>(cell)) return
        headers.push(extractTextContent(cell.props.children))
      })
    })
  })

  return headers
}

const MarkdownTableContext = createContext<{
  centerColumns: Set<number>
  nextColumnIndex: () => number
  resetRow: () => void
} | null>(null)

export function MarkdownTable({
  children,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement> & { children?: ReactNode }) {
  const headers = useMemo(() => extractTableHeaders(children), [children])
  const centerColumns = useMemo(() => getCenterAlignedColumnIndexes(headers), [headers])
  const isPmPlan = useMemo(() => isPmPlanTableHeaders(headers), [headers])
  const columnRef = useRef(0)
  const contextValue = useMemo(
    () => ({
      centerColumns,
      nextColumnIndex: () => columnRef.current++,
      resetRow: () => {
        columnRef.current = 0
      },
    }),
    [centerColumns],
  )

  return (
    <div className={isPmPlan ? 'tm-md-table-wrap tm-md-table-wrap--pm-plan' : 'tm-md-table-wrap'}>
      <MarkdownTableContext.Provider value={contextValue}>
        <table
          className={[
            'tm-md-table',
            isPmPlan ? 'tm-md-table--pm-plan' : '',
            centerColumns.size > 0 ? 'tm-md-table--has-center-cols' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          {...props}
        >
          {children}
        </table>
      </MarkdownTableContext.Provider>
    </div>
  )
}

export function MarkdownTableRow({
  children,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { children?: ReactNode }) {
  const context = useContext(MarkdownTableContext)
  context?.resetRow()
  return <tr {...props}>{children}</tr>
}

function MarkdownTableCell({
  as: Tag,
  children,
  ...props
}: {
  as: 'th' | 'td'
  children?: ReactNode
} & React.TdHTMLAttributes<HTMLTableCellElement>) {
  const context = useContext(MarkdownTableContext)
  const columnIndex = context?.nextColumnIndex() ?? -1
  const centered = context?.centerColumns.has(columnIndex) ?? false

  return (
    <Tag className={centered ? 'tm-md-table-cell--center' : undefined} {...props}>
      {renderMarkdownHtmlBreaks(children)}
    </Tag>
  )
}

export function MarkdownTableHeaderCell({
  children,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { children?: ReactNode }) {
  return (
    <MarkdownTableCell as="th" {...props}>
      {children}
    </MarkdownTableCell>
  )
}

export function MarkdownTableDataCell({
  children,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { children?: ReactNode }) {
  return (
    <MarkdownTableCell as="td" {...props}>
      {children}
    </MarkdownTableCell>
  )
}
