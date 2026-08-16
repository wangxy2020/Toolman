export function looksLikeExcelAnalysisGoal(goal: string): boolean {
  const text = goal.trim()
  if (!text) return false
  const hasWorkbook = /excel|xlsx|xls|价格表|价表|表格|spreadsheet/i.test(text)
  const hasAnalysis = /统计|汇总|分析|货币|金额|ipc|报告|summary|report|合计|逐/.test(text)
  return hasWorkbook && hasAnalysis
}

export function looksLikeDirectoryListingGoal(goal: string): boolean {
  if (looksLikeExcelAnalysisGoal(goal)) return false
  return /目录|文件夹|文件列表|文件目录|扫描|整理|listing|directory|清单/.test(goal)
    || (/excel|csv|xlsx|表格/.test(goal) && /目录|清单|listing|列表/.test(goal))
}
