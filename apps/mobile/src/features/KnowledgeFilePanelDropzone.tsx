import { Pressable, Text } from 'react-native'
import { styles } from './KnowledgeFilePanelStyles'

export type KnowledgeFilePanelDropzoneProps = {
  isUrlMode: boolean
  dragOver: boolean
  disabled: boolean
  onPick: () => void
}

export function KnowledgeFilePanelDropzone({
  isUrlMode,
  dragOver,
  disabled,
  onPick,
}: KnowledgeFilePanelDropzoneProps) {
  return (
    <Pressable
      disabled={disabled}
      onPress={() => void onPick()}
      style={({ pressed }) => [
        styles.dropzone,
        dragOver ? styles.dropzoneActive : null,
        pressed && !disabled ? styles.dropzonePressed : null,
        disabled ? styles.dropzoneDisabled : null,
      ]}
    >
      <Text style={styles.dropTitle}>
        {isUrlMode ? '拖拽网页到这里或点击添加' : '拖拽文件到这里或点击添加'}
      </Text>
      <Text style={styles.dropHint}>
        {isUrlMode
          ? '支持 HTTP/HTTPS 网页链接，也可从浏览器拖拽书签或链接'
          : '支持 TXT, MD, HTML, PDF, DOCX, PPTX, XLSX, EPUB... 格式'}
      </Text>
    </Pressable>
  )
}
