export const PLAN_WBS_QUICK_PHRASE_ID = 'toolman:pm-plan-wbs'
export const PLAN_WBS_QUICK_PHRASE_TITLE = 'AI 生成 WBS'
export const PLAN_WBS_QUICK_PHRASE_CONTENT = `请根据当前项目的进度 WBS，补充或生成完整层级计划。

先输出 Markdown 任务表，列：层级 | 任务名称 | 工期(天) | 开始日期 | 完成日期 | 前置任务。
第 1 行必须是项目名称（总工期）；其余任务挂在其下。前置任务列用层级编号写逻辑关系（如 1.1FS、1.2SS+5），不要写任务名称。

再输出 JSON 对象（\`\`\`json 代码块）供系统应用：
{
  "projectName": "项目名称",
  "projectPlan": { "planStart": "YYYY-MM-DD", "planFinish": "YYYY-MM-DD", "durationDays": number },
  "wbs": [
    {
      "title": "中文标题",
      "type": "task | milestone | wbs_node | phase",
      "parentTitle": "父任务标题（根可省略）",
      "durationDays": number,
      "startDate": "YYYY-MM-DD",
      "dueDate": "YYYY-MM-DD",
      "predecessors": [{ "title": "前置任务标题", "type": "FS | SS | FF | SF", "lagDays": 0 }],
      "priority": "low | normal | high | urgent"
    }
  ]
}
层级覆盖单位/分部/分项/区域/部位等。除最早开始任务外每项须有 predecessors，网络须从开工连通到竣工。表格给人看，JSON 给系统用。`
export const PLAN_WBS_QUICK_PHRASE_REVISION = 6

export const PLAN_SCHEDULE_QUICK_PHRASE_ID = 'toolman:pm-plan-schedule'
export const PLAN_SCHEDULE_QUICK_PHRASE_TITLE = 'AI 自动排期'
export const PLAN_SCHEDULE_QUICK_PHRASE_CONTENT = `请根据当前计划工作项与 FS/SS/FF/SF 依赖关系，提出排期调整建议。对每项输出：
- workItemTitle
- suggestedStartDate（YYYY-MM-DD）
- suggestedDueDate（YYYY-MM-DD）
- reason（一句话）
以 Markdown 表格输出。也可在同条消息附带可解析 WBS JSON（含 parentTitle、durationDays、predecessors、projectPlan）。`
export const PLAN_SCHEDULE_QUICK_PHRASE_REVISION = 2

export const COST_FORECAST_QUICK_PHRASE_ID = 'toolman:pm-cost-forecast'
export const COST_FORECAST_QUICK_PHRASE_TITLE = 'AI 成本预测'
export const COST_FORECAST_QUICK_PHRASE_CONTENT = `请基于当前 EPC 成本台账（合同额、已结算、待支付）与风险项目，给出未来一季度成本预测：
1. 预计结算节奏与现金流
2. 高风险项目与偏差原因
3. 建议跟进动作（3 条以内）
使用清晰中文条目。`
export const COST_FORECAST_QUICK_PHRASE_REVISION = 1

export const REPORT_DAILY_QUICK_PHRASE_ID = 'toolman:pm-report-daily'
export const REPORT_DAILY_QUICK_PHRASE_TITLE = 'AI 项目日报'
export const REPORT_DAILY_QUICK_PHRASE_CONTENT = `请根据当前项目待办、进度与风险，生成今日项目日报（Markdown）：
## 今日完成
## 进行中
## 风险与阻塞
## 明日计划
语气简洁，适合保存为笔记。`
export const REPORT_DAILY_QUICK_PHRASE_REVISION = 1

export const REPORT_WEEKLY_QUICK_PHRASE_ID = 'toolman:pm-report-weekly'
export const REPORT_WEEKLY_QUICK_PHRASE_TITLE = 'AI 项目周报'
export const REPORT_WEEKLY_QUICK_PHRASE_CONTENT = `请生成本周项目周报（Markdown）：
## 本周亮点
## 进度与里程碑
## 成本/资源摘要
## 问题与决策项
## 下周重点
适合导出到笔记。`
export const REPORT_WEEKLY_QUICK_PHRASE_REVISION = 1

export const REPORT_MONTHLY_QUICK_PHRASE_ID = 'toolman:pm-report-monthly'
export const REPORT_MONTHLY_QUICK_PHRASE_TITLE = 'AI 项目月报'
export const REPORT_MONTHLY_QUICK_PHRASE_CONTENT = `请生成本月项目管理月报（Markdown）：
## 月度概览
## 关键指标（进度/成本）
## 重大事件
## 风险台账
## 下月目标
适合保存为笔记归档。`
export const REPORT_MONTHLY_QUICK_PHRASE_REVISION = 1

export const PLAN_BUILTIN_QUICK_PHRASES = [
  {
    id: PLAN_WBS_QUICK_PHRASE_ID,
    label: PLAN_WBS_QUICK_PHRASE_TITLE,
    text: PLAN_WBS_QUICK_PHRASE_CONTENT,
    revision: PLAN_WBS_QUICK_PHRASE_REVISION,
  },
  {
    id: PLAN_SCHEDULE_QUICK_PHRASE_ID,
    label: PLAN_SCHEDULE_QUICK_PHRASE_TITLE,
    text: PLAN_SCHEDULE_QUICK_PHRASE_CONTENT,
    revision: PLAN_SCHEDULE_QUICK_PHRASE_REVISION,
  },
  {
    id: COST_FORECAST_QUICK_PHRASE_ID,
    label: COST_FORECAST_QUICK_PHRASE_TITLE,
    text: COST_FORECAST_QUICK_PHRASE_CONTENT,
    revision: COST_FORECAST_QUICK_PHRASE_REVISION,
  },
  {
    id: REPORT_DAILY_QUICK_PHRASE_ID,
    label: REPORT_DAILY_QUICK_PHRASE_TITLE,
    text: REPORT_DAILY_QUICK_PHRASE_CONTENT,
    revision: REPORT_DAILY_QUICK_PHRASE_REVISION,
  },
  {
    id: REPORT_WEEKLY_QUICK_PHRASE_ID,
    label: REPORT_WEEKLY_QUICK_PHRASE_TITLE,
    text: REPORT_WEEKLY_QUICK_PHRASE_CONTENT,
    revision: REPORT_WEEKLY_QUICK_PHRASE_REVISION,
  },
  {
    id: REPORT_MONTHLY_QUICK_PHRASE_ID,
    label: REPORT_MONTHLY_QUICK_PHRASE_TITLE,
    text: REPORT_MONTHLY_QUICK_PHRASE_CONTENT,
    revision: REPORT_MONTHLY_QUICK_PHRASE_REVISION,
  },
] as const

export const PLAN_SLASH_COMMANDS = [
  { command: '/wbs', description: '生成 WBS 建议（JSON）' },
  { command: '/schedule', description: '自动排期建议' },
  { command: '/forecast', description: '成本预测分析' },
] as const
