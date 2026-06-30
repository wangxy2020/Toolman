/** 工作 4/5 步骤 1 穿透表：Markdown 聊天区与卡片共用列宽约定 */

export const EPC_DISCOVERY_TABLE_CLASS = 'epc-discovery-table'

/** 列宽比例（table-layout: fixed + width:100% 时随容器伸缩） */
export const EPC_DISCOVERY_FILE_NAME_COLUMN_PERCENT = 34
export const EPC_DISCOVERY_QUEUE_COLUMN_PERCENT = 12

/** 分类列最小宽度（约 4 个汉字），窄屏时可横向滚动 */
export const EPC_DISCOVERY_QUEUE_COLUMN_MIN_WIDTH_PX = 104

/** @deprecated 使用 EPC_DISCOVERY_QUEUE_COLUMN_MIN_WIDTH_PX */
export const EPC_DISCOVERY_QUEUE_COLUMN_WIDTH_PX = EPC_DISCOVERY_QUEUE_COLUMN_MIN_WIDTH_PX

/** @deprecated 使用 EPC_DISCOVERY_FILE_NAME_COLUMN_PERCENT */
export const EPC_DISCOVERY_FILE_NAME_COLUMN_WIDTH_PX = 240

export interface EpcDiscoveryTableRow {
  fileName: string
  queueLabel: string
  description: string
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** 固定列宽的 HTML 表（由 markdown.css 中 .epc-discovery-table 控制样式） */
export const formatEpcDiscoveryTableHtml = (rows: EpcDiscoveryTableRow[]): string[] => {
  if (rows.length === 0) {
    return ['（工作区未发现 xlsx 文件）']
  }

  const bodyRows = rows
    .map(
      (row) =>
        `<tr><td class="epc-discovery-filename">${escapeHtml(row.fileName)}</td><td class="epc-discovery-queue">${escapeHtml(row.queueLabel)}</td><td class="epc-discovery-desc">${escapeHtml(row.description)}</td></tr>`
    )
    .join('\n')

  return [
    `<table class="${EPC_DISCOVERY_TABLE_CLASS}">`,
    '<colgroup>',
    `<col class="epc-discovery-filename" style="width:${EPC_DISCOVERY_FILE_NAME_COLUMN_PERCENT}%" />`,
    `<col class="epc-discovery-queue" style="width:${EPC_DISCOVERY_QUEUE_COLUMN_PERCENT}%" />`,
    '<col class="epc-discovery-desc" />',
    '</colgroup>',
    '<thead><tr>',
    '<th class="epc-discovery-filename">文件名</th>',
    '<th class="epc-discovery-queue">分类</th>',
    '<th class="epc-discovery-desc">说明</th>',
    '</tr></thead>',
    '<tbody>',
    bodyRows,
    '</tbody>',
    '</table>'
  ]
}
