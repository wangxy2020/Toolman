import { useEffect } from 'react'
import type { SlashCommandItem } from './slash-commands'

export function useSlashMenuKeyboard({
  slashMenuOpen,
  slashCommandsLength,
  slashActiveIndex,
  setSlashActiveIndex,
  localizedSlashCommands,
  runSlashCommand,
}: {
  slashMenuOpen: boolean
  slashCommandsLength: number
  slashActiveIndex: number
  setSlashActiveIndex: (updater: (index: number) => number) => void
  localizedSlashCommands: SlashCommandItem[]
  runSlashCommand: (item: SlashCommandItem) => void
}) {
  useEffect(() => {
    if (!slashMenuOpen) return

    const onKeyDown = (event: Event) => {
      if (!(event instanceof KeyboardEvent)) return
      if (event.metaKey && event.key === 'ArrowDown') {
        event.preventDefault()
        setSlashActiveIndex((index) => Math.min(index + 5, slashCommandsLength - 1))
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSlashActiveIndex((index) => Math.min(index + 1, slashCommandsLength - 1))
      } else if (event.metaKey && event.key === 'ArrowUp') {
        event.preventDefault()
        setSlashActiveIndex((index) => Math.max(index - 5, 0))
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSlashActiveIndex((index) => Math.max(index - 1, 0))
      } else if (event.key === 'Enter') {
        event.preventDefault()
        const item = localizedSlashCommands[slashActiveIndex]
        if (item) runSlashCommand(item)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [
    localizedSlashCommands,
    runSlashCommand,
    slashActiveIndex,
    slashCommandsLength,
    slashMenuOpen,
    setSlashActiveIndex,
  ])
}

export function usePhraseMenuKeyboard({
  phraseMenuOpen,
  addingPhrase,
  phraseMenuItemsLength,
  phraseActiveIndex,
  setPhraseActiveIndex,
  handleSelectQuickPhrase,
}: {
  phraseMenuOpen: boolean
  addingPhrase: boolean
  phraseMenuItemsLength: number
  phraseActiveIndex: number
  setPhraseActiveIndex: (updater: (index: number) => number) => void
  handleSelectQuickPhrase: (index: number) => void
}) {
  useEffect(() => {
    if (!phraseMenuOpen || addingPhrase) return

    const onKeyDown = (event: Event) => {
      if (!(event instanceof KeyboardEvent)) return
      const maxIndex = phraseMenuItemsLength - 1
      if (event.metaKey && event.key === 'ArrowDown') {
        event.preventDefault()
        setPhraseActiveIndex((index) => Math.min(index + 5, maxIndex))
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        setPhraseActiveIndex((index) => Math.min(index + 1, maxIndex))
      } else if (event.metaKey && event.key === 'ArrowUp') {
        event.preventDefault()
        setPhraseActiveIndex((index) => Math.max(index - 5, 0))
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setPhraseActiveIndex((index) => Math.max(index - 1, 0))
      } else if (event.key === 'Enter') {
        event.preventDefault()
        handleSelectQuickPhrase(phraseActiveIndex)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [
    addingPhrase,
    handleSelectQuickPhrase,
    phraseActiveIndex,
    phraseMenuItemsLength,
    phraseMenuOpen,
    setPhraseActiveIndex,
  ])
}
