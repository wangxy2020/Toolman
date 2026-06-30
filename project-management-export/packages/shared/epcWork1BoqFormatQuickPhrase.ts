/**
 * EPC 工作 1 — 内置快捷短语（合同价格表检查和处理）
 *
 * ⚠️ 请勿在未获产品/业务负责人明确授权时修改 `EPC_WORK1_BOQ_FORMAT_QUICK_PHRASE_CONTENT`。
 * - 工作流触发使用固定短语 ID、标题或关键词规则，勿绑定全文相等。
 * - 若必须更新显示文案：只改本文件，并递增 `EPC_WORK1_BOQ_FORMAT_QUICK_PHRASE_CONTENT_REVISION`。
 * - `packages/shared/__tests__/epcWork1BoqFormatQuickPhrase.test.ts` 会锁定正文。
 */

/** 递增后才会把新正文同步进 IndexedDB 内置条目 */
export const EPC_WORK1_BOQ_FORMAT_QUICK_PHRASE_CONTENT_REVISION = 1

export const EPC_WORK1_BOQ_FORMAT_DEFAULT_QUICK_PHRASE_ID = 'epc-work1-boq-format'

export const EPC_WORK1_BOQ_FORMAT_QUICK_PHRASE_TITLE = '合同价格表检查和处理'

/** 快捷短语列表/输入框中展示的正文（入口说明，非智能体系统提示） */
export const EPC_WORK1_BOQ_FORMAT_QUICK_PHRASE_CONTENT =
  '对各项目价格表进行检查，处理成固定格式的表格。'
