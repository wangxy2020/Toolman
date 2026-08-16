import { type ReactNode } from 'react'
import { Text, View } from 'react-native'
import { groupPagePanelStyles as styles } from './groupPagePanelStyles'

export type SharedItemDetail = {
  title: string
  body?: string
  blobUrl?: string
  mimeType?: string
  canEdit: boolean
}

export function GroupPanelHeader(props: {
  title: string
  subtitle: string
  actions?: ReactNode
}) {
  return (
    <View style={styles.panelHeader}>
      <View style={styles.panelHeading}>
        <Text style={styles.panelTitle}>{props.title}</Text>
        <Text style={styles.panelSubtitle}>{props.subtitle}</Text>
      </View>
      {props.actions}
    </View>
  )
}
