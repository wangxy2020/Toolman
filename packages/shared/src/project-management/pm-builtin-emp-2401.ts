/** Built-in EMP-2401 owner-managed master plan sample (government investment). */

export type PmBuiltinWorkItemSeed = {
  key: string
  parentKey?: string
  type: 'task' | 'milestone' | 'wbs_node' | 'issue' | 'phase'
  title: string
  status: string
  priority: string
  progressPercent: number
  sortOrder: number
  description?: string
  assignee?: string
  /** Calendar day YYYY-MM-DD */
  startDate?: string
  dueDate?: string
}

export type PmBuiltinRelationSeed = {
  fromKey: string
  toKey: string
  type: 'FS' | 'SS' | 'FF' | 'SF'
  lagDays: number
}

export type PmBuiltinProjectSeed = {
  code: string
  name: string
  status: string
  domain: 'progress_management'
  description?: string
  metadata: Record<string, unknown>
  workItems: PmBuiltinWorkItemSeed[]
  relations: PmBuiltinRelationSeed[]
  baselineName?: string
}

export const PM_BUILTIN_EMP_2401: PmBuiltinProjectSeed = 
{
  "code": "EMP-2401",
  "name": "示例项目政府投资类项目总控计划（业主管理）",
  "status": "active",
  "domain": "progress_management",
  "description": "程序内置示例：政府投资类项目总控计划（业主管理视角）",
  "metadata": {
    "source": "builtin",
    "builtinKey": "emp_2401_owner_managed_master_plan",
    "projectType": "owner_managed",
    "planPhase": "建设前期",
    "planCalendar": "calendar_days",
    "scheduleFrom": "project_start"
  },
  "workItems": [
    {
      "key": "feasibility_approval",
      "type": "milestone",
      "title": "可研批复",
      "status": "todo",
      "priority": "normal",
      "progressPercent": 0,
      "sortOrder": 1,
      "startDate": "2026-07-12",
      "dueDate": "2026-07-12"
    },
    {
      "key": "bidding_agent_selection",
      "type": "task",
      "title": "招标代理比选",
      "status": "todo",
      "priority": "normal",
      "progressPercent": 0,
      "sortOrder": 2,
      "startDate": "2026-07-13",
      "dueDate": "2026-07-26"
    },
    {
      "key": "bidding_plan_publish",
      "type": "task",
      "title": "招标计划发布",
      "status": "todo",
      "priority": "normal",
      "progressPercent": 0,
      "sortOrder": 3,
      "startDate": "2026-07-13",
      "dueDate": "2026-08-11"
    },
    {
      "key": "procurement_phase_1",
      "type": "task",
      "title": "招标采购（一）",
      "status": "todo",
      "priority": "normal",
      "progressPercent": 0,
      "sortOrder": 4,
      "startDate": "2026-07-27",
      "dueDate": "2026-09-04"
    },
    {
      "key": "survey_bidding",
      "parentKey": "procurement_phase_1",
      "type": "task",
      "title": "勘察测量招标",
      "status": "todo",
      "priority": "normal",
      "progressPercent": 0,
      "sortOrder": 5,
      "startDate": "2026-07-27",
      "dueDate": "2026-08-25"
    },
    {
      "key": "design_bidding",
      "parentKey": "procurement_phase_1",
      "type": "task",
      "title": "设计招标",
      "status": "todo",
      "priority": "normal",
      "progressPercent": 0,
      "sortOrder": 6,
      "startDate": "2026-07-27",
      "dueDate": "2026-09-04"
    },
    {
      "key": "cost_consult_bidding",
      "parentKey": "procurement_phase_1",
      "type": "task",
      "title": "造价咨询招标",
      "status": "todo",
      "priority": "normal",
      "progressPercent": 0,
      "sortOrder": 7,
      "startDate": "2026-07-27",
      "dueDate": "2026-08-25"
    },
    {
      "key": "site_survey_report",
      "type": "task",
      "title": "现场勘察测量及报告编制",
      "status": "todo",
      "priority": "normal",
      "progressPercent": 0,
      "sortOrder": 8,
      "startDate": "2026-08-26",
      "dueDate": "2026-09-24"
    },
    {
      "key": "preliminary_design_package",
      "type": "task",
      "title": "初步设计及概算编制、审批",
      "status": "todo",
      "priority": "normal",
      "progressPercent": 0,
      "sortOrder": 9,
      "startDate": "2026-09-05",
      "dueDate": "2026-11-29"
    },
    {
      "key": "scheme_design_report",
      "parentKey": "preliminary_design_package",
      "type": "task",
      "title": "方案设计和汇报",
      "status": "todo",
      "priority": "normal",
      "progressPercent": 0,
      "sortOrder": 10,
      "startDate": "2026-09-05",
      "dueDate": "2026-10-02"
    },
    {
      "key": "construction_drawing_package",
      "type": "task",
      "title": "施工图设计、图审、财评",
      "status": "todo",
      "priority": "normal",
      "progressPercent": 0,
      "sortOrder": 11,
      "startDate": "2026-11-02",
      "dueDate": "2027-02-27"
    },
    {
      "key": "preliminary_design_budget",
      "parentKey": "preliminary_design_package",
      "type": "task",
      "title": "初步设计及概算编制",
      "status": "todo",
      "priority": "normal",
      "progressPercent": 0,
      "sortOrder": 11,
      "startDate": "2026-10-03",
      "dueDate": "2026-11-01"
    },
    {
      "key": "preliminary_design_approval",
      "parentKey": "preliminary_design_package",
      "type": "task",
      "title": "初步设计及概算审批",
      "status": "todo",
      "priority": "normal",
      "progressPercent": 0,
      "sortOrder": 12,
      "startDate": "2026-11-02",
      "dueDate": "2026-11-29"
    },
    {
      "key": "construction_drawing_design",
      "parentKey": "construction_drawing_package",
      "type": "task",
      "title": "施工图设计",
      "status": "todo",
      "priority": "normal",
      "progressPercent": 0,
      "sortOrder": 12,
      "startDate": "2026-11-02",
      "dueDate": "2026-12-31"
    },
    {
      "key": "procurement_phase_2",
      "type": "task",
      "title": "招标采购（二）",
      "status": "todo",
      "priority": "normal",
      "progressPercent": 0,
      "sortOrder": 13,
      "startDate": "2027-02-28",
      "dueDate": "2027-04-12"
    },
    {
      "key": "construction_drawing_review",
      "parentKey": "construction_drawing_package",
      "type": "task",
      "title": "施工图审查",
      "status": "todo",
      "priority": "normal",
      "progressPercent": 0,
      "sortOrder": 13,
      "startDate": "2027-01-01",
      "dueDate": "2027-01-21"
    },
    {
      "key": "supervision_construction_bid_approval",
      "parentKey": "procurement_phase_2",
      "type": "task",
      "title": "监理、施工招标核准",
      "status": "todo",
      "priority": "normal",
      "progressPercent": 0,
      "sortOrder": 14,
      "startDate": "2027-02-28",
      "dueDate": "2027-03-03"
    },
    {
      "key": "survey_report_review",
      "parentKey": "construction_drawing_package",
      "type": "task",
      "title": "勘察报告审查",
      "status": "todo",
      "priority": "normal",
      "progressPercent": 0,
      "sortOrder": 14,
      "startDate": "2027-01-01",
      "dueDate": "2027-01-08"
    },
    {
      "key": "supervision_bidding",
      "parentKey": "procurement_phase_2",
      "type": "task",
      "title": "监理招标",
      "status": "todo",
      "priority": "normal",
      "progressPercent": 0,
      "sortOrder": 15,
      "startDate": "2027-03-04",
      "dueDate": "2027-04-12"
    },
    {
      "key": "planning_permit_civil_defense",
      "type": "task",
      "title": "工程规划许可、人防备案",
      "status": "todo",
      "priority": "normal",
      "progressPercent": 0,
      "sortOrder": 15,
      "startDate": "2027-01-22",
      "dueDate": "2027-02-20"
    },
    {
      "key": "construction_budget_prepare",
      "parentKey": "construction_drawing_package",
      "type": "task",
      "title": "施工预算编制",
      "status": "todo",
      "priority": "normal",
      "progressPercent": 0,
      "sortOrder": 15,
      "startDate": "2027-01-01",
      "dueDate": "2027-01-30"
    },
    {
      "key": "construction_budget_finance_review",
      "parentKey": "construction_drawing_package",
      "type": "task",
      "title": "施工图预算财评",
      "status": "todo",
      "priority": "normal",
      "progressPercent": 0,
      "sortOrder": 16,
      "startDate": "2027-01-31",
      "dueDate": "2027-02-27"
    },
    {
      "key": "construction_permit",
      "type": "task",
      "title": "施工许可证办理",
      "status": "todo",
      "priority": "normal",
      "progressPercent": 0,
      "sortOrder": 16,
      "startDate": "2027-04-13",
      "dueDate": "2027-04-26"
    },
    {
      "key": "general_contract_bidding",
      "parentKey": "procurement_phase_2",
      "type": "task",
      "title": "施工总承包招标",
      "status": "todo",
      "priority": "normal",
      "progressPercent": 0,
      "sortOrder": 16,
      "startDate": "2027-03-04",
      "dueDate": "2027-04-12"
    },
    {
      "key": "secondary_fee_bidding",
      "parentKey": "procurement_phase_2",
      "type": "task",
      "title": "其它二类费项目招标",
      "status": "todo",
      "priority": "normal",
      "progressPercent": 0,
      "sortOrder": 17,
      "startDate": "2027-03-04",
      "dueDate": "2027-04-12"
    },
    {
      "key": "commencement",
      "type": "milestone",
      "title": "开工",
      "status": "todo",
      "priority": "normal",
      "progressPercent": 0,
      "sortOrder": 25,
      "startDate": "2027-04-27",
      "dueDate": "2027-04-27"
    }
  ],
  "relations": [
    {
      "fromKey": "feasibility_approval",
      "toKey": "bidding_agent_selection",
      "type": "FS",
      "lagDays": 0
    },
    {
      "fromKey": "feasibility_approval",
      "toKey": "bidding_plan_publish",
      "type": "FS",
      "lagDays": 0
    },
    {
      "fromKey": "bidding_agent_selection",
      "toKey": "survey_bidding",
      "type": "FS",
      "lagDays": 0
    },
    {
      "fromKey": "bidding_agent_selection",
      "toKey": "design_bidding",
      "type": "FS",
      "lagDays": 0
    },
    {
      "fromKey": "bidding_agent_selection",
      "toKey": "cost_consult_bidding",
      "type": "FS",
      "lagDays": 0
    },
    {
      "fromKey": "survey_bidding",
      "toKey": "site_survey_report",
      "type": "FS",
      "lagDays": 0
    },
    {
      "fromKey": "design_bidding",
      "toKey": "scheme_design_report",
      "type": "FS",
      "lagDays": 0
    },
    {
      "fromKey": "site_survey_report",
      "toKey": "preliminary_design_budget",
      "type": "FS",
      "lagDays": 0
    },
    {
      "fromKey": "scheme_design_report",
      "toKey": "preliminary_design_budget",
      "type": "FS",
      "lagDays": 0
    },
    {
      "fromKey": "preliminary_design_budget",
      "toKey": "preliminary_design_approval",
      "type": "FS",
      "lagDays": 0
    },
    {
      "fromKey": "preliminary_design_budget",
      "toKey": "construction_drawing_design",
      "type": "FS",
      "lagDays": 0
    },
    {
      "fromKey": "construction_drawing_design",
      "toKey": "construction_drawing_review",
      "type": "FS",
      "lagDays": 0
    },
    {
      "fromKey": "construction_drawing_design",
      "toKey": "construction_budget_prepare",
      "type": "FS",
      "lagDays": 0
    },
    {
      "fromKey": "construction_budget_prepare",
      "toKey": "construction_budget_finance_review",
      "type": "FS",
      "lagDays": 0
    },
    {
      "fromKey": "construction_budget_finance_review",
      "toKey": "supervision_construction_bid_approval",
      "type": "FS",
      "lagDays": 0
    },
    {
      "fromKey": "supervision_construction_bid_approval",
      "toKey": "supervision_bidding",
      "type": "FS",
      "lagDays": 0
    },
    {
      "fromKey": "supervision_construction_bid_approval",
      "toKey": "general_contract_bidding",
      "type": "FS",
      "lagDays": 0
    },
    {
      "fromKey": "supervision_construction_bid_approval",
      "toKey": "secondary_fee_bidding",
      "type": "FS",
      "lagDays": 0
    },
    {
      "fromKey": "construction_drawing_review",
      "toKey": "planning_permit_civil_defense",
      "type": "FS",
      "lagDays": 0
    },
    {
      "fromKey": "general_contract_bidding",
      "toKey": "construction_permit",
      "type": "FS",
      "lagDays": 0
    },
    {
      "fromKey": "construction_permit",
      "toKey": "commencement",
      "type": "FS",
      "lagDays": 0
    },
    {
      "fromKey": "construction_drawing_review",
      "toKey": "survey_report_review",
      "type": "SS",
      "lagDays": 0
    }
  ],
  "baselineName": "内置基线"
}
