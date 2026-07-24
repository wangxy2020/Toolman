export const PLAN_WBS_QUICK_PHRASE_ID = 'toolman:pm-plan-wbs'
export const PLAN_WBS_QUICK_PHRASE_TITLE = 'AI 生成 WBS'
export const PLAN_WBS_QUICK_PHRASE_CONTENT = `请根据当前项目的进度 WBS，补充或生成完整层级计划。

请严格按以下四段 Markdown 输出（**不要输出 JSON / 代码块**；系统会直接从任务表解析并写入甘特）：

### 一、任务表（WBS层级）
列固定为：| 层级 | 任务名称 | 工期(天) | 开始日期 | 完成日期 | 前置任务 |
第 1 行必须是**当前项目名称**（如 PRJ-2601 · Toolman项目1），工期/起止为项目总工期；不要把说明文字写进任务名称。
其余任务按深度优先挂在其下（父项后紧跟全部子项）。前置任务列用层级编号写逻辑关系（如 1.1FS、1.2SS+5），不要写任务名称；汇总行前置写 —，逻辑关系仅写在叶子任务上。
汇总行起止须包络子项；除最早开始的叶子外，每个叶子须有前置，网络从开工连通到竣工。

### 二、计划合规性说明
用短列表说明总工期、层级完整性与前置连通性。

### 三、关键路径说明
标出关键路径主要段落及合计日历天。

### 四、调度说明（或后续建议）
补充平行路径、汇聚节点与下一步建议（3–6 条以内）。`
export const PLAN_WBS_QUICK_PHRASE_REVISION = 9

export const PLAN_SCHEDULE_QUICK_PHRASE_ID = 'toolman:pm-plan-schedule'
export const PLAN_SCHEDULE_QUICK_PHRASE_TITLE = 'AI 自动排期'
export const PLAN_SCHEDULE_QUICK_PHRASE_CONTENT = `请根据当前计划工作项与 FS/SS/FF/SF 依赖关系，提出排期调整建议。

请用 Markdown 输出（不要 JSON）：
1. 调整说明（短列表）
2. 建议排期表，列：| workItemTitle | suggestedStartDate | suggestedDueDate | reason |
也可直接输出完整 WBS 任务表（列：层级 | 任务名称 | 工期(天) | 开始日期 | 完成日期 | 前置任务），系统会从表解析。`
export const PLAN_SCHEDULE_QUICK_PHRASE_REVISION = 3

export const PLAN_RESOURCE_QUICK_PHRASE_ID = 'toolman:pm-plan-resource'
export const PLAN_RESOURCE_QUICK_PHRASE_TITLE = 'AI 资源用量'
export const PLAN_RESOURCE_QUICK_PHRASE_CONTENT = `请根据当前计划任务与资源列表，为叶子任务给出资源用量建议。

先用 Markdown 表（任务 | 资源类型 | 资源名称 | 数量 | 单位）说明；再输出 JSON 供系统确认写入甘特：
\`\`\`json
{
  "resourcePlan": [
    {
      "workItemTitle": "与甘特任务名称一致",
      "assignments": [
        { "type": "labor", "name": "普通工", "quantity": 20, "unit": "工日" }
      ]
    }
  ]
}
\`\`\`
type 可用 labor/auxiliary/material/equipment/device/instrument/funds/custom/management/fees/comprehensive/measures/tax/investment/designEstimate/constructionBudget/costBudget/other（或中文人力/辅材/材料/机械/设备/仪器/资金/自定义/综合单价/措施费/税金/投资估算/设计概算/施工预算/成本预算等）。名称优先用资源列表已有项；确需新增仍输出该名称。`
export const PLAN_RESOURCE_QUICK_PHRASE_REVISION = 3

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
    id: PLAN_RESOURCE_QUICK_PHRASE_ID,
    label: PLAN_RESOURCE_QUICK_PHRASE_TITLE,
    text: PLAN_RESOURCE_QUICK_PHRASE_CONTENT,
    revision: PLAN_RESOURCE_QUICK_PHRASE_REVISION,
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
  { command: '/resource', description: '任务资源用量建议' },
  { command: '/forecast', description: '成本预测分析' },
] as const
