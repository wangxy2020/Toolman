/**
 * EPC 工作 4 — 内置快捷短语（用户可见入口文案）
 *
 * ⚠️ 请勿在未获产品/业务负责人明确授权时修改 `EPC_COMMERCIAL_QUICK_PHRASE_CONTENT`。
 * - 该正文仅作为启动说明展示；本地 Rust 引擎与智能体汇报逻辑不依赖这段措辞。
 * - 工作流触发请使用固定短语 ID、标题或 `isEpcCommercialWorkflowInput` 中的关键词规则，勿绑定全文相等。
 * - 若必须更新显示文案：只改本文件，并递增 `EPC_COMMERCIAL_QUICK_PHRASE_CONTENT_REVISION`。
 * - `packages/shared/__tests__/epcCommercialQuickPhrase.test.ts` 会锁定正文，擅自修改会导致 CI 失败。
 */

/** 递增后才会把新正文同步进 IndexedDB 内置条目（用户本地已改标题时仍会同步正文） */
export const EPC_COMMERCIAL_QUICK_PHRASE_CONTENT_REVISION = 3

export const EPC_COMMERCIAL_DEFAULT_QUICK_PHRASE_ID = 'epc-work4-quantity-payment-stats'

export const EPC_COMMERCIAL_QUICK_PHRASE_TITLE = '进度款工程量数据统计'

/** 快捷短语列表/输入框中展示的正文（入口说明，非智能体系统提示） */
export const EPC_COMMERCIAL_QUICK_PHRASE_CONTENT =
  '请对当前工作区中，各文件夹内的工程量清单与进度款数据进行分析和统计。分析工程量清单中前期、本期完成的工程数量，累计已完成工程数量，已完成百分比，完成金额，本期完成金额等有无错误。将本期完成的工程量金额作为一列，统计到合同价格表中。'
