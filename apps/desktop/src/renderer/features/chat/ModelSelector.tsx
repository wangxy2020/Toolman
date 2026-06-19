import type { Provider } from '@toolman/shared'
import { buildModelOptions } from './model-utils'

interface Props {
  providers: Provider[]
  selectedModelId: string | null
  onChange: (modelId: string) => void
}

export function ModelSelector({ providers, selectedModelId, onChange }: Props) {
  const options = buildModelOptions(providers)

  if (options.length === 0) {
    return <span style={styles.empty}>未配置模型</span>
  }

  return (
    <select
      style={styles.select}
      value={selectedModelId ?? options[0].modelId}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((opt) => (
        <option key={opt.modelId} value={opt.modelId}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

const styles: Record<string, React.CSSProperties> = {
  select: {
    padding: '6px 10px',
    borderRadius: 8,
    border: '1px solid #2a2f3d',
    background: '#1a1e28',
    color: '#e8eaed',
    fontSize: 13,
    maxWidth: 280,
  },
  empty: {
    fontSize: 13,
    color: '#9aa0a6',
  },
}
