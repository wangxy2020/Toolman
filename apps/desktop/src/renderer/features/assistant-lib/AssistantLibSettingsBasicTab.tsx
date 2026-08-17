import type { AssistantLibPresetId, VoiceTtsEngine } from '@toolman/shared'
import { AgentSettingsToggle } from '../chat/agent-settings-modal-components'
import { AssistantSettingsHelpHint } from '../chat/assistant-settings-components'
import { CURATED_EDGE_TTS_VOICES } from '../voice/tts-provider-factory'
import type { useAssistantLibSettingsDialog } from './hooks/useAssistantLibSettingsDialog'

type DialogState = ReturnType<typeof useAssistantLibSettingsDialog>

export function AssistantLibSettingsBasicTab({
  state,
}: {
  state: Pick<
    DialogState,
    | 't'
    | 'draft'
    | 'isDefaultClassroom'
    | 'presets'
    | 'selectedPreset'
    | 'pathDisplay'
    | 'hasTextbookSelection'
    | 'busy'
    | 'updateDraft'
    | 'handlePresetChange'
    | 'handleBrowse'
    | 'handleClearTextbook'
    | 'modelOptions'
  >
}) {
  const {
    t,
    draft,
    isDefaultClassroom,
    presets,
    selectedPreset,
    pathDisplay,
    hasTextbookSelection,
    busy,
    updateDraft,
    handlePresetChange,
    handleBrowse,
    handleClearTextbook,
    modelOptions,
  } = state

  if (!draft) return null

  return (
    <div className="tm-kb-settings-form">
                    <p className="tm-kb-settings-hint">{t('assistantLibPage.settingsHint')}</p>

                    <div className="tm-kb-settings-row">
                      <label className="tm-kb-settings-label" htmlFor="alib-settings-course-name">
                        {t('assistantLibPage.courseName')}
                      </label>
                      <input
                        id="alib-settings-course-name"
                        className="tm-kb-settings-input"
                        value={
                          isDefaultClassroom
                            ? t('assistantLibPage.defaultCourse')
                            : draft.courseName
                        }
                        onChange={(event) => updateDraft({ courseName: event.target.value })}
                        disabled={isDefaultClassroom}
                      />
                    </div>

                    <div className="tm-kb-settings-row">
                      <div className="tm-alib-settings-label-group">
                        <label className="tm-kb-settings-label" htmlFor="alib-settings-model">
                          {t('assistantLibPage.courseModel')}
                        </label>
                        <AssistantSettingsHelpHint title={t('assistantLibPage.courseModelHint')} />
                      </div>
                      {modelOptions.length === 0 ? (
                        <p className="tm-kb-settings-hint">{t('assistantLibPage.courseModelEmpty')}</p>
                      ) : (
                        <select
                          id="alib-settings-model"
                          className="tm-kb-settings-input"
                          value={draft.modelId}
                          onChange={(event) => updateDraft({ modelId: event.target.value })}
                        >
                          <option value="">{t('assistantLibPage.courseModelDefault')}</option>
                          {modelOptions.map((opt) => (
                            <option key={opt.modelId} value={opt.modelId}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div className="tm-kb-settings-row tm-kb-settings-row--top">
                      <label className="tm-kb-settings-label" htmlFor="alib-settings-preset">
                        {t('assistantLibPage.teachingMode')}
                      </label>
                      <div className="tm-alib-settings-preset-field">
                        <select
                          id="alib-settings-preset"
                          className="tm-kb-settings-input"
                          value={draft.presetId}
                          onChange={(event) =>
                            handlePresetChange(event.target.value as AssistantLibPresetId)
                          }
                        >
                          {presets.map((preset) => (
                            <option key={preset.id} value={preset.id}>
                              {t(`assistantLibPage.presets.${preset.id}`)}
                            </option>
                          ))}
                        </select>
                        {selectedPreset ? (
                          <p className="tm-kb-settings-hint">
                            {t(`assistantLibPage.presetDescs.${selectedPreset.id}`)}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="tm-kb-settings-row">
                      <span className="tm-kb-settings-label">
                        {t('assistantLibPage.settingsReferee')}
                      </span>
                      <label className="tm-alib-settings-toggle">
                        <input
                          type="checkbox"
                          checked={draft.refereeEnabled}
                          onChange={(event) =>
                            updateDraft({ refereeEnabled: event.target.checked })
                          }
                        />
                        <span>{t('assistantLibPage.settingsRefereeHint')}</span>
                      </label>
                    </div>

                    <div className="tm-kb-settings-row tm-kb-settings-row--top">
                      <div className="tm-alib-settings-label-group">
                        <span className="tm-kb-settings-label">
                          {t('assistantLibPage.textbookKb')}
                        </span>
                        <AssistantSettingsHelpHint title={t('assistantLibPage.textbookKbHint')} />
                      </div>
                      <div className="tm-agent-setting-block">
                        <div
                          className="tm-kb-kind-radio-group"
                          role="radiogroup"
                          aria-label={t('assistantLibPage.textbookKb')}
                        >
                          <label className="tm-kb-kind-radio">
                            <input
                              type="radio"
                              name="alib-settings-textbook-source"
                              checked={draft.textbookSource === 'knowledge'}
                              onChange={() =>
                                updateDraft({
                                  textbookSource: 'knowledge',
                                  filePaths: [],
                                })
                              }
                            />
                            <span>{t('assistantLibPage.textbookSourceKb')}</span>
                          </label>
                          <label className="tm-kb-kind-radio">
                            <input
                              type="radio"
                              name="alib-settings-textbook-source"
                              checked={draft.textbookSource === 'local'}
                              onChange={() =>
                                updateDraft({
                                  textbookSource: 'local',
                                  kbId: '',
                                  kbPath: '',
                                })
                              }
                            />
                            <span>{t('assistantLibPage.textbookSourceLocal')}</span>
                          </label>
                        </div>

                        <div className="tm-agent-workdir-field tm-alib-textbook-path">
                          <div className="tm-agent-workdir-input-group">
                            <input
                              className="tm-agent-workdir-input"
                              readOnly
                              value={pathDisplay}
                              placeholder={
                                draft.textbookSource === 'local'
                                  ? t('assistantLibPage.textbookLocalPlaceholder')
                                  : t('assistantLibPage.selectKb')
                              }
                              title={pathDisplay || undefined}
                            />
                            <button
                              type="button"
                              className="tm-agent-workdir-browse"
                              onClick={() => void handleBrowse()}
                              disabled={busy}
                            >
                              {t('assistantLibPage.selectFiles')}
                            </button>
                          </div>
                          {hasTextbookSelection ? (
                            <button
                              type="button"
                              className="tm-agent-workdir-reset"
                              onClick={handleClearTextbook}
                              disabled={busy}
                            >
                              {t('common.clear')}
                            </button>
                          ) : null}
                          <p className="tm-agent-field-hint">
                            {draft.textbookSource === 'local'
                              ? t('assistantLibPage.textbookLocalHint')
                              : t('assistantLibPage.textbookKbBrowseHint')}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="tm-kb-settings-row">
                      <div className="tm-alib-settings-label-group">
                        <span className="tm-kb-settings-label">{t('agent.fields.autoSpeak')}</span>
                        <AssistantSettingsHelpHint
                          title={t('assistantLibPage.settingsAutoSpeakHint')}
                        />
                      </div>
                      <AgentSettingsToggle
                        checked={draft.autoSpeak}
                        onChange={(value) => updateDraft({ autoSpeak: value })}
                      />
                    </div>

                    <div className="tm-kb-settings-row">
                      <div className="tm-alib-settings-label-group">
                        <label className="tm-kb-settings-label" htmlFor="alib-settings-tts-engine">
                          {t('agent.fields.ttsEngine')}
                        </label>
                        <AssistantSettingsHelpHint title={t('agent.fields.ttsEngineHint')} />
                      </div>
                      <select
                        id="alib-settings-tts-engine"
                        className="tm-kb-settings-input"
                        value={draft.ttsEngine}
                        onChange={(event) =>
                          updateDraft({
                            ttsEngine: event.target.value as VoiceTtsEngine,
                          })
                        }
                      >
                        <option value="edge">{t('agent.fields.ttsEngineEdge')}</option>
                        <option value="web-speech">{t('agent.fields.ttsEngineWebSpeech')}</option>
                      </select>
                    </div>

                    {draft.ttsEngine === 'edge' ? (
                      <div className="tm-kb-settings-row">
                        <div className="tm-alib-settings-label-group">
                          <label className="tm-kb-settings-label" htmlFor="alib-settings-tts-voice">
                            {t('agent.fields.ttsVoice')}
                          </label>
                          <AssistantSettingsHelpHint title={t('agent.fields.ttsVoiceHint')} />
                        </div>
                        <select
                          id="alib-settings-tts-voice"
                          className="tm-kb-settings-input"
                          value={draft.ttsVoice}
                          onChange={(event) => updateDraft({ ttsVoice: event.target.value })}
                        >
                          {CURATED_EDGE_TTS_VOICES.map((voice) => (
                            <option key={voice.value} value={voice.value}>
                              {voice.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
    </div>
  )
}
