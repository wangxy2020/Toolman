export const toolApprovalPageEn = {
  title: {
    default: 'Tool call approval',
    docxBatch: 'Word document edit approval',
    excelBatch: 'Excel spreadsheet edit approval',
  },
  queueHint: '{{count}} pending',
  batchHint: {
    excel:
      'This will call modify_excel_cells / highlight_excel_cells to write a revised copy. After approval, further Excel edit tools in this task run automatically without prompts.',
    docx:
      'This will call multiple DOCX edit tools (comments, replace, paragraph edits, etc.). After approval, further DOCX tools in this task run automatically without prompts.',
  },
  permissionHint: 'The agent wants to call the following tool. Approve to continue.',
  noArgs: '(no arguments)',
  reject: 'Reject',
  allow: 'Allow',
  allowAll: 'Allow all',
} as const
