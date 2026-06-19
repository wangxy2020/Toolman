import type { ProviderModel } from '@toolman/shared'
import { getDisplayModelTypes } from '@toolman/shared'
import { ModelTypeIcon, type ModelTypeIconKey } from './ModelTypeIcon'

interface Props {
  model: Pick<ProviderModel, 'id' | 'types'>
  className?: string
}

function CapIcon({ type, title }: { type: ModelTypeIconKey; title: string }) {
  return (
    <span className={`tm-model-cap-icon tm-model-cap-icon--${type}`} title={title}>
      <ModelTypeIcon type={type} size={12} />
    </span>
  )
}

export function ModelCapabilityTags({ model, className }: Props) {
  const types = getDisplayModelTypes(model)

  if (types.embedding) {
    return (
      <div className={`tm-model-cap-icons ${className ?? ''}`.trim()}>
        <CapIcon type="embedding" title="嵌入" />
      </div>
    )
  }

  if (types.rerank) {
    return (
      <div className={`tm-model-cap-icons ${className ?? ''}`.trim()}>
        <CapIcon type="rerank" title="重排" />
      </div>
    )
  }

  const icons: Array<{ key: ModelTypeIconKey; title: string }> = []
  if (types.vision) icons.push({ key: 'vision', title: '视觉' })
  if (types.web) icons.push({ key: 'web', title: '联网' })
  if (types.reasoning) icons.push({ key: 'reasoning', title: '推理' })
  if (types.tools) icons.push({ key: 'tools', title: '工具' })

  if (icons.length === 0) return null

  return (
    <div className={`tm-model-cap-icons ${className ?? ''}`.trim()}>
      {icons.map((item) => (
        <CapIcon key={item.key} type={item.key} title={item.title} />
      ))}
    </div>
  )
}
