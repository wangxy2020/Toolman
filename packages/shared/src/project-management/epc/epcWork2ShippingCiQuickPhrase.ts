/**
 * EPC 工作 2 — 内置快捷短语（商业发票和工程量清单编制）
 *
 * ⚠️ 请勿在未获产品/业务负责人明确授权时修改 `EPC_WORK2_SHIPPING_CI_QUICK_PHRASE_CONTENT`。
 * - 工作流触发使用固定短语 ID、标题或关键词规则，勿绑定全文相等。
 * - 若必须更新显示文案：只改本文件，并递增 `EPC_WORK2_SHIPPING_CI_QUICK_PHRASE_CONTENT_REVISION`。
 * - `packages/shared/__tests__/epcWork2ShippingCiQuickPhrase.test.ts` 会锁定正文。
 */

/** 递增后才会把新正文同步进 IndexedDB 内置条目 */
export const EPC_WORK2_SHIPPING_CI_QUICK_PHRASE_CONTENT_REVISION = 3

export const EPC_WORK2_SHIPPING_CI_DEFAULT_QUICK_PHRASE_ID = 'epc-work2-shipping-ci'

export const EPC_WORK2_SHIPPING_CI_QUICK_PHRASE_TITLE = '进度款商业发票和工程量清单编制'

/** 快捷短语列表/输入框中展示的正文（入口说明，非智能体系统提示） */
export const EPC_WORK2_SHIPPING_CI_QUICK_PHRASE_CONTENT =
  '将项目文件夹下海运使用的商业发票，处理成第N期进度款格式的商业发票、工程量清单和中期支付证书。'
