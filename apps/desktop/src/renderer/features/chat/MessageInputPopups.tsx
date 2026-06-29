import {
  InputPopupMenu,
  InputPopupMenuList,
} from './InputPopupMenu'
import type { useMessageInput } from './useMessageInput'

type MessageInputState = ReturnType<typeof useMessageInput>

export function MessageInputPopups({ input }: { input: MessageInputState }) {
  const {
    t,
    slashMenuOpen,
    setSlashMenuOpen,
    phraseMenuOpen,
    setPhraseMenuOpen,
    addingPhrase,
    setAddingPhrase,
    phraseDraft,
    setPhraseDraft,
    slashActiveIndex,
    setSlashActiveIndex,
    phraseActiveIndex,
    setPhraseActiveIndex,
    localizedSlashCommands,
    phraseMenuItems,
    runSlashCommand,
    handleAddQuickPhrase,
    handleSelectQuickPhrase,
  } = input

  return (
    <>
      <InputPopupMenu
        title={t('chat.input.slashCommands')}
        open={slashMenuOpen}
        onClose={() => setSlashMenuOpen(false)}
      >
        <InputPopupMenuList
          items={localizedSlashCommands.map((item) => ({
            id: item.id,
            command: item.command,
            description: item.description,
          }))}
          activeIndex={slashActiveIndex}
          onActiveIndexChange={setSlashActiveIndex}
          onSelect={(index) => {
            const item = localizedSlashCommands[index]
            if (item) runSlashCommand(item)
          }}
        />
      </InputPopupMenu>

      <InputPopupMenu
        title={t('chat.input.quickPhrases')}
        open={phraseMenuOpen}
        onClose={() => {
          setPhraseMenuOpen(false)
          setAddingPhrase(false)
          setPhraseDraft('')
        }}
      >
        {addingPhrase ? (
          <div className="tm-input-popup-menu-form">
            <input
              className="tm-input-popup-menu-input"
              value={phraseDraft}
              placeholder={t('chat.input.quickPhrasePlaceholder')}
              autoFocus
              onChange={(e) => setPhraseDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAddQuickPhrase()
                }
              }}
            />
            <div className="tm-input-popup-menu-form-actions">
              <button
                type="button"
                className="tm-input-popup-menu-form-btn"
                onClick={() => {
                  setAddingPhrase(false)
                  setPhraseDraft('')
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="tm-input-popup-menu-form-btn tm-input-popup-menu-form-btn--primary"
                disabled={!phraseDraft.trim()}
                onClick={handleAddQuickPhrase}
              >
                {t('chat.input.save')}
              </button>
            </div>
          </div>
        ) : (
          <InputPopupMenuList
            items={phraseMenuItems}
            activeIndex={phraseActiveIndex}
            onActiveIndexChange={setPhraseActiveIndex}
            onSelect={handleSelectQuickPhrase}
          />
        )}
      </InputPopupMenu>
    </>
  )
}
