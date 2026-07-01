import { useEffect, useMemo } from 'react'
import { loadQuickPhrases, type QuickPhrase } from './quick-phrases'
import { getGroupSlashCommands, SLASH_COMMANDS, type SlashCommandItem } from './slash-commands'
import type { InputPopupMenuItemData } from './InputPopupMenu'
import type { TranslateFn } from '../../i18n/I18nProvider'

export function useMessageInputMenus({
  toolbarMode,
  groupIsOwner,
  t,
  quickPhrases,
  setQuickPhrases,
  slashMenuOpen,
  phraseMenuOpen,
  setSlashActiveIndex,
  setPhraseActiveIndex,
  loadQuickPhrasesFn,
  extraSlashCommands = [],
}: {
  toolbarMode: 'agent' | 'group'
  groupIsOwner: boolean
  t: TranslateFn
  quickPhrases: QuickPhrase[]
  setQuickPhrases: (phrases: QuickPhrase[]) => void
  slashMenuOpen: boolean
  phraseMenuOpen: boolean
  setSlashActiveIndex: (index: number) => void
  setPhraseActiveIndex: (index: number) => void
  loadQuickPhrasesFn?: () => QuickPhrase[]
  extraSlashCommands?: SlashCommandItem[]
}) {
  const slashCommands = useMemo(
    () => [
      ...(toolbarMode === 'group' ? getGroupSlashCommands(groupIsOwner) : SLASH_COMMANDS),
      ...(toolbarMode === 'agent' ? extraSlashCommands : []),
    ],
    [extraSlashCommands, groupIsOwner, toolbarMode],
  )
  const localizedSlashCommands = useMemo(
    () =>
      slashCommands.map((item) => ({
        ...item,
        description: t(
          `chat.slashCommands.${
            item.id === 'new'
              ? 'newSession'
              : item.id === 'clear' && toolbarMode === 'group'
                ? 'clearGroup'
                : item.id
          }`,
        ),
      })),
    [slashCommands, t, toolbarMode],
  )
  const phraseMenuItems = useMemo<InputPopupMenuItemData[]>(
    () => [
      { id: 'add', command: t('chat.input.addQuickPhrase'), showIcon: false },
      ...quickPhrases.map((phrase) => ({
        id: phrase.id,
        command: phrase.label,
        description: phrase.text,
        showIcon: false,
      })),
    ],
    [quickPhrases, t],
  )

  useEffect(() => {
    setQuickPhrases(loadQuickPhrasesFn ? loadQuickPhrasesFn() : loadQuickPhrases())
  }, [loadQuickPhrasesFn, setQuickPhrases])

  useEffect(() => {
    if (slashMenuOpen) setSlashActiveIndex(0)
  }, [setSlashActiveIndex, slashMenuOpen])

  useEffect(() => {
    if (phraseMenuOpen) setPhraseActiveIndex(0)
  }, [phraseMenuOpen, setPhraseActiveIndex])

  return { slashCommands, localizedSlashCommands, phraseMenuItems }
}
