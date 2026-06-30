/** 跨 Inputbar 工具与会话输入栏：记录用户是否刚选了 EPC 工作 4 斜杠命令 */
let epcWork4SlashCommandPicked = false

export const markEpcWork4SlashCommandPicked = (): void => {
  epcWork4SlashCommandPicked = true
}

export const consumeEpcWork4SlashCommandPicked = (): boolean => {
  if (!epcWork4SlashCommandPicked) {
    return false
  }
  epcWork4SlashCommandPicked = false
  return true
}
