import { Pressable, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { useMobileApp } from '../state/MobileAppContext'
import { colors } from '../theme'
import {
  DEFAULT_FOLDER_LABEL,
  knowledgeBasesForSection,
  KNOWLEDGE_SIDEBAR_SECTIONS,
  type KnowledgeSidebarSection,
} from './knowledgeSidebar'
import { knowledgePaneStyles as styles } from './KnowledgePanes.styles'
import {
  SidebarAddButton,
  SidebarList,
  SidebarShell,
} from './sidebarUi'
import { useKnowledgeUi } from './useKnowledgeUi'

function SectionChevron({ open }: { open: boolean }) {
  return (
    <Text style={[styles.chevron, open ? styles.chevronOpen : null]} accessibilityElementsHidden>
      ›
    </Text>
  )
}

function IconFolder({ size = 14, color = colors.textSecondary }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"
        stroke={color}
        strokeWidth={1.8}
        fill="none"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

function KnowledgeSidebarKbItem(props: {
  label: string
  meta?: string
  active?: boolean
  onPress: () => void
}) {
  const active = Boolean(props.active)
  return (
    <Pressable
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.kbItem,
        active ? styles.kbItemActive : null,
        pressed && !active ? styles.kbItemPressed : null,
      ]}
    >
      <View style={styles.kbItemIcon}>
        <IconFolder size={14} color={colors.textSecondary} />
      </View>
      <View style={styles.kbItemText}>
        <Text
          style={[styles.kbItemLabel, active ? styles.kbItemLabelActive : null]}
          numberOfLines={1}
        >
          {props.label}
        </Text>
        {props.meta ? (
          <Text style={styles.kbItemMeta} numberOfLines={1}>
            {props.meta}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
}

export function KnowledgeLeftPane() {
  const { setLeftOpen } = useMobileApp()
  const {
    activeSection,
    activeKbId,
    expanded,
    toggleExpanded,
    selectSection,
    selectKb,
    syncedKbs,
    createdKbs,
    openCreateModal,
  } = useKnowledgeUi()

  const kbsForSection = (sectionId: KnowledgeSidebarSection) =>
    knowledgeBasesForSection(sectionId, createdKbs, syncedKbs)

  return (
    <SidebarShell>
      <SidebarAddButton label="添加知识库" onPress={openCreateModal} />
      <SidebarList>
        {KNOWLEDGE_SIDEBAR_SECTIONS.map((section) => {
          const isOpen = expanded.has(section.id)
          const isActive = activeSection === section.id
          const remoteKbs = kbsForSection(section.id)
          const sectionDisabled = section.id === 'local'
          return (
            <View key={section.id} style={[styles.group, sectionDisabled ? styles.groupDisabled : null]}>
              <View
                style={[
                  styles.sectionRow,
                  isActive && !sectionDisabled ? styles.sectionRowActive : null,
                ]}
              >
                <Pressable
                  accessibilityLabel={isOpen ? '折叠' : '展开'}
                  disabled={sectionDisabled}
                  onPress={() => toggleExpanded(section.id)}
                  style={({ pressed }) => [
                    styles.expandHit,
                    pressed && !sectionDisabled ? styles.expandHitPressed : null,
                  ]}
                >
                  <SectionChevron open={isOpen} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive, disabled: sectionDisabled }}
                  disabled={sectionDisabled}
                  onPress={() => selectSection(section.id)}
                  style={styles.sectionNameHit}
                >
                  <Text
                    style={[
                      styles.sectionName,
                      isActive && !sectionDisabled ? styles.sectionNameActive : null,
                      sectionDisabled ? styles.sectionNameDisabled : null,
                    ]}
                    numberOfLines={1}
                  >
                    {section.label}
                  </Text>
                </Pressable>
              </View>
              {isOpen && !sectionDisabled ? (
                <View style={styles.sectionBody}>
                  {section.defaultFolderId ? (
                    <KnowledgeSidebarKbItem
                      label={DEFAULT_FOLDER_LABEL}
                      active={
                        activeSection === section.id && activeKbId === section.defaultFolderId
                      }
                      onPress={() => {
                        selectKb(section.id, section.defaultFolderId!, DEFAULT_FOLDER_LABEL)
                        setLeftOpen(false)
                      }}
                    />
                  ) : null}
                  {remoteKbs.map((kb) => (
                    <KnowledgeSidebarKbItem
                      key={kb.id}
                      label={kb.name}
                      active={activeSection === section.id && activeKbId === kb.id}
                      onPress={() => {
                        selectKb(section.id, kb.id, kb.name)
                        setLeftOpen(false)
                      }}
                    />
                  ))}
                  {section.id === 'shared' &&
                  !section.defaultFolderId &&
                  remoteKbs.length === 0 ? (
                    <Text style={styles.sectionEmpty}>{section.emptyHint}</Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          )
        })}
      </SidebarList>
    </SidebarShell>
  )
}
