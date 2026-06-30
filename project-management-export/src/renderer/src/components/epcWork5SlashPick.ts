/** 跨 Inputbar 工具与会话输入栏：记录用户是否刚选了 EPC 工作 5 斜杠命令 */
let epcWork5SlashCommandPicked = false

export const markEpcWork5SlashCommandPicked = (): void => {
  epcWork5SlashCommandPicked = true
}

export const consumeEpcWork5SlashCommandPicked = (): boolean => {
  if (!epcWork5SlashCommandPicked) {
    return false
  }
  epcWork5SlashCommandPicked = false
  return true
}
