let epcWork2SlashCommandPicked = false

export const markEpcWork2SlashCommandPicked = (): void => {
  epcWork2SlashCommandPicked = true
}

export const consumeEpcWork2SlashCommandPicked = (): boolean => {
  if (!epcWork2SlashCommandPicked) {
    return false
  }
  epcWork2SlashCommandPicked = false
  return true
}
