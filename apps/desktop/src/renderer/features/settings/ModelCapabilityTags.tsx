import type { ProviderModel } from '@toolman/shared'
import { getDisplayModelTypes } from '@toolman/shared'
import { useI18n } from '../../i18n/useI18n'
import { getModelCapabilityLabel } from '../../i18n/settings-labels'
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
  const { t } = useI18n()
  const types = getDisplayModelTypes(model)

  if (types.embedding) {
    return (
      <div className={`tm-model-cap-icons ${className ?? ''}`.trim()}>
        <CapIcon type="embedding" title={getModelCapabilityLabel('embedding', t)} />
      </div>
    )
  }

  if (types.rerank) {
    return (
      <div className={`tm-model-cap-icons ${className ?? ''}`.trim()}>
        <CapIcon type="rerank" title={getModelCapabilityLabel('rerank', t)} />
      </div>
    )
  }

  const icons: Array<{ key: ModelTypeIconKey; title: string }> = []
  if (types.vision) icons.push({ key: 'vision', title: getModelCapabilityLabel('vision', t) })
  if (types.web) icons.push({ key: 'web', title: getModelCapabilityLabel('web', t) })
  if (types.reasoning) icons.push({ key: 'reasoning', title: getModelCapabilityLabel('reasoning', t) })
  if (types.tools) icons.push({ key: 'tools', title: getModelCapabilityLabel('tools', t) })

  if (icons.length === 0) return null

  return (
    <div className={`tm-model-cap-icons ${className ?? ''}`.trim()}>
      {icons.map((item) => (
        <CapIcon key={item.key} type={item.key} title={item.title} />
      ))}
    </div>
  )
}
