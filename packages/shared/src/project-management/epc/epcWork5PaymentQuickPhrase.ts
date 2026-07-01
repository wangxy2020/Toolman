/**
 * EPC 工作 5 — 内置快捷短语（进度款申请与支付数据统计）
 *
 * ⚠️ 请勿在未获产品/业务负责人明确授权时修改 `EPC_WORK5_PAYMENT_QUICK_PHRASE_CONTENT`。
 * - 工作流触发使用固定短语 ID、标题或关键词规则，勿绑定全文相等。
 * - 若必须更新显示文案：只改本文件，并递增 `EPC_WORK5_PAYMENT_QUICK_PHRASE_CONTENT_REVISION`。
 * - `packages/shared/__tests__/epcWork5PaymentQuickPhrase.test.ts` 会锁定正文。
 */

/** 递增后才会把新正文同步进 IndexedDB 内置条目 */
export const EPC_WORK5_PAYMENT_QUICK_PHRASE_CONTENT_REVISION = 1

export const EPC_WORK5_PAYMENT_DEFAULT_QUICK_PHRASE_ID = 'epc-work5-payment-stats'

export const EPC_WORK5_PAYMENT_QUICK_PHRASE_TITLE = '进度款申请与支付数据统计'

/** 快捷短语列表/输入框中展示的正文（入口说明，非智能体系统提示） */
export const EPC_WORK5_PAYMENT_QUICK_PHRASE_CONTENT =
  '根据进度款申请资料和回款信息等，统计各项目每个价格表中，每一期进度的已完成金额，应付金额，预付款扣回金额，预留金额，生效日期，账期天数，应支付日期，实际支付日期等信息。'
