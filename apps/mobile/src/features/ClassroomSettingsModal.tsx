import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSettingsModalSize } from './settingsModalLayout'
import {
  ClassroomBasicTab,
  ClassroomDocTab,
  ClassroomSyncTab,
} from './ClassroomSettingsTabs'
import { ClassroomTextbookKbPicker } from './ClassroomTextbookKbPicker'
import { classroomSettingsModalStyles as styles } from './classroomSettingsModalStyles'
import {
  CLASSROOM_SETTINGS_TABS,
  useClassroomSettingsModal,
  type ClassroomSettingsModalProps,
} from './useClassroomSettingsModal'

export function ClassroomSettingsModal(props: ClassroomSettingsModalProps) {
  const {
    visible,
    knowledgeMeta,
    knowledgeNames,
    classroomSyncEnabled,
    desktopHostsOnline,
    onClassroomSyncEnabledChange,
    onClose,
    onRememberKbLabels,
  } = props
  const { width: dialogWidth, height: dialogHeight } = useSettingsModalSize()
  const {
    activeTab,
    selectTab,
    draft,
    editingDoc,
    setEditingDoc,
    error,
    confirmDelete,
    setConfirmDelete,
    courseLabel,
    isGuide,
    isDefault,
    shownPresets,
    selectedPreset,
    updateDraft,
    handleSave,
    handleDelete,
    handleGenerateSyllabus,
    docValue,
    setDocValue,
    kbPickerOpen,
    setKbPickerOpen,
    syllabusGenerating,
  } = useClassroomSettingsModal(props)

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.modalRoot}>
          <KeyboardAvoidingView
            style={styles.overlay}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="关闭" />
            <View
              style={[styles.dialog, { width: dialogWidth, height: dialogHeight }]}
              onStartShouldSetResponder={() => true}
            >
              <View style={styles.header}>
                <View style={styles.titleRow}>
                  <View style={styles.titleDot} />
                  <Text style={styles.title} numberOfLines={1}>
                    {courseLabel}设置
                  </Text>
                </View>
                <Pressable onPress={onClose} accessibilityLabel="关闭" hitSlop={8} style={styles.closeBtn}>
                  <Text style={styles.closeText}>×</Text>
                </Pressable>
              </View>

              {!props.course || !draft ? (
                <View style={styles.emptyBody}>
                  <Text style={styles.hint}>请先在侧栏选择一门课程。</Text>
                </View>
              ) : (
                <>
                  <View style={styles.body}>
                    <View style={styles.nav}>
                      {CLASSROOM_SETTINGS_TABS.map((tab) => {
                        const active = activeTab === tab.id
                        return (
                          <Pressable
                            key={tab.id}
                            onPress={() => selectTab(tab.id)}
                            style={[styles.navItem, active ? styles.navItemActive : null]}
                          >
                            <Text style={[styles.navItemText, active ? styles.navItemTextActive : null]}>
                              {tab.label}
                            </Text>
                          </Pressable>
                        )
                      })}
                    </View>

                    <ScrollView
                      style={styles.content}
                      contentContainerStyle={styles.contentInner}
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator={false}
                      showsHorizontalScrollIndicator={false}
                    >
                      {error ? <Text style={styles.error}>{error}</Text> : null}

                      {activeTab === 'basic' ? (
                        <ClassroomBasicTab
                          draft={draft}
                          isDefault={isDefault}
                          shownPresets={shownPresets}
                          selectedPreset={selectedPreset}
                          knowledgeNames={knowledgeNames}
                          updateDraft={updateDraft}
                          onOpenKbPicker={() => setKbPickerOpen(true)}
                          onClearKb={() => updateDraft({ kbIds: [], kbLabel: '' })}
                        />
                      ) : null}

                      {activeTab === 'teaching' || activeTab === 'lesson' ? (
                        <ClassroomDocTab
                          kind={activeTab}
                          value={docValue}
                          editing={editingDoc}
                          generating={activeTab === 'lesson' ? syllabusGenerating : false}
                          onToggleEdit={() => setEditingDoc((value) => !value)}
                          onChange={setDocValue}
                          onGenerateSyllabus={
                            activeTab === 'lesson'
                              ? () => {
                                  void handleGenerateSyllabus()
                                }
                              : undefined
                          }
                        />
                      ) : null}

                      {activeTab === 'sync' ? (
                        <ClassroomSyncTab
                          classroomSyncEnabled={classroomSyncEnabled}
                          desktopHostsOnline={desktopHostsOnline}
                          onClassroomSyncEnabledChange={onClassroomSyncEnabledChange}
                        />
                      ) : null}

                      {activeTab === 'danger' ? (
                        <View style={styles.dangerCard}>
                          {isDefault || isGuide ? (
                            <Text style={styles.hint}>
                              {isDefault ? '默认课程不可删除。' : 'Toolman使用说明课程不可删除。'}
                            </Text>
                          ) : (
                            <>
                              <Text style={styles.sectionTitle}>危险操作</Text>
                              <Text style={styles.hint}>
                                删除后将移除本课程课堂与对话记录，此操作不可撤销。教材知识库文件不会被删除。
                              </Text>
                              <Pressable
                                onPress={() => setConfirmDelete(true)}
                                style={({ pressed }) => [
                                  styles.dangerBtn,
                                  pressed ? styles.dangerBtnPressed : null,
                                ]}
                              >
                                <Text style={styles.dangerBtnText}>删除课程</Text>
                              </Pressable>
                            </>
                          )}
                        </View>
                      ) : null}
                    </ScrollView>
                  </View>

                  <View style={styles.footer}>
                    <Pressable onPress={onClose} style={[styles.footerBtn, styles.footerBtnSecondary]}>
                      <Text style={styles.footerBtnSecondaryText}>
                        {activeTab === 'danger' || activeTab === 'sync' ? '关闭' : '取消'}
                      </Text>
                    </Pressable>
                    {activeTab !== 'danger' && activeTab !== 'sync' ? (
                      <Pressable
                        onPress={handleSave}
                        style={[styles.footerBtn, styles.footerBtnPrimary]}
                      >
                        <Text style={styles.footerBtnPrimaryText}>保存</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>

        {confirmDelete ? (
          <View style={styles.confirmOverlay} pointerEvents="box-none">
            <View style={styles.confirmDialog}>
              <Text style={styles.confirmTitle}>删除课程</Text>
              <Text style={[styles.hint, { paddingHorizontal: 16 }]}>
                确定要删除「{courseLabel}」吗？课堂与对话记录将被移除，且不可恢复。
              </Text>
              <View style={styles.footer}>
                <Pressable
                  onPress={() => setConfirmDelete(false)}
                  style={[styles.footerBtn, styles.footerBtnSecondary]}
                >
                  <Text style={styles.footerBtnSecondaryText}>取消</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setConfirmDelete(false)
                    handleDelete()
                  }}
                  style={[styles.footerBtn, styles.confirmDangerBtn]}
                >
                  <Text style={styles.confirmDangerText}>删除课程</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
      </Modal>

      <ClassroomTextbookKbPicker
        visible={kbPickerOpen}
        selectedKbId={draft?.kbIds[0] ?? null}
        fallbackItems={knowledgeMeta}
        onClose={() => setKbPickerOpen(false)}
        onSelect={(item) => {
          updateDraft({ kbIds: [item.id], kbLabel: item.name })
          onRememberKbLabels([item.id], [item.name])
          setKbPickerOpen(false)
        }}
      />
    </>
  )
}
