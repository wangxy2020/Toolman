import { useCallback, useState } from 'react'
import { IpcChannel } from '@toolman/shared'

export function useErrorDiagnosis() {
  const [diagnosing, setDiagnosing] = useState(false)

  const diagnose = useCallback(async (options: { modelId: string; errorSummary: string }) => {
    setDiagnosing(true)
    try {
      const result = await window.api.invoke(IpcChannel.MessageDiagnose, {
        modelId: options.modelId,
        errorSummary: options.errorSummary,
      })

      if (!result.ok) {
        throw new Error(result.error.message)
      }

      return result.data as { text: string }
    } finally {
      setDiagnosing(false)
    }
  }, [])

  return { diagnose, diagnosing }
}
