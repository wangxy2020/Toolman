let epcWork1SlashCommandPicked = false

export const markEpcWork1SlashCommandPicked = (): void => {
  epcWork1SlashCommandPicked = true
}

export const consumeEpcWork1SlashCommandPicked = (): boolean => {
  if (!epcWork1SlashCommandPicked) {
    return false
  }
  epcWork1SlashCommandPicked = false
  return true
}
