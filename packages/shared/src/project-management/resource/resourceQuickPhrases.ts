/** Built-in quick phrases for the resource-management agent session. */

export const RESOURCE_CATALOG_QUICK_PHRASE_ID = 'toolman:pm-resource-catalog'
export const RESOURCE_CATALOG_QUICK_PHRASE_TITLE = 'AI 检查资源列表'
export const RESOURCE_CATALOG_QUICK_PHRASE_CONTENT = [
  '请基于**本轮系统注入**的资源列表做检查（不是工作目录文件，也不是用户粘贴）：',
  '- 「### 全部项目适用的资源列表（系统默认 · 权威数据源）」',
  '- 「### 项目资源列表」（含 EMP-2401、PRJ-2601 等系统默认与用户自建）',
  '',
  '请检查：',
  '1. 各列表的类型、名称、规格、计量单位、计价单位、单价、说明是否齐全、合理；',
  '2. 是否有明显重复、命名不规范，或与「全部项目」不一致却无说明的项；',
  '3. 用 Markdown 列表/表格给出增补、修改、删除建议（标明目标列表：全部项目 / 项目编码）；不要输出 resourceCatalogPatches JSON，除非我明确要求 JSON。',
  '',
  '禁止去工作目录找 Excel/文档，禁止声称「未注入资源数据」——以上注入区块即为数据源。',
  '不要编造列表中不存在且无依据的资源；若建议新增，请说明用途。',
].join('\n')
export const RESOURCE_CATALOG_QUICK_PHRASE_REVISION = 5

export const RESOURCE_PLAN_ASSIST_QUICK_PHRASE_ID = 'toolman:pm-resource-plan-assist'
export const RESOURCE_PLAN_ASSIST_QUICK_PHRASE_TITLE = '资源计划协作说明'
export const RESOURCE_PLAN_ASSIST_QUICK_PHRASE_CONTENT = [
  '请结合系统注入的资源列表字段（类型、名称、规格、计量单位、计价单位、单价、说明），说明如何为计划管理中的任务配置资源用量。',
  '系统默认列表：全部项目、EMP-2401、PRJ-2601；其余为用户自建。均可查询与维护。',
  '若用户后续在「计划管理」会话中确认资源计划，系统会把用量写入甘特资源分配列。',
  '资源字典修改建议默认用列表说明；不要输出 JSON，除非用户明确要求。',
  '不要去工作目录搜索资源表文件。',
].join('\n')
export const RESOURCE_PLAN_ASSIST_QUICK_PHRASE_REVISION = 4

export const RESOURCE_BUILTIN_QUICK_PHRASES = [
  {
    id: RESOURCE_CATALOG_QUICK_PHRASE_ID,
    label: RESOURCE_CATALOG_QUICK_PHRASE_TITLE,
    text: RESOURCE_CATALOG_QUICK_PHRASE_CONTENT,
    revision: RESOURCE_CATALOG_QUICK_PHRASE_REVISION,
  },
  {
    id: RESOURCE_PLAN_ASSIST_QUICK_PHRASE_ID,
    label: RESOURCE_PLAN_ASSIST_QUICK_PHRASE_TITLE,
    text: RESOURCE_PLAN_ASSIST_QUICK_PHRASE_CONTENT,
    revision: RESOURCE_PLAN_ASSIST_QUICK_PHRASE_REVISION,
  },
]
