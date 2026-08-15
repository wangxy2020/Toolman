import { useEffect, useMemo, useState } from 'react'
import type { GroupActivity, GroupSharedKind } from '../storage/groupChat'
import type { GroupPickerSelection } from './GroupResourcePickerModal'
import { groupSharedPickerHint, sortGroupActivities } from './groupPagePanelUtils'

export function useGroupSharedResourcePane(input: {
  kind: GroupSharedKind
  onAdd: (selection: GroupPickerSelection[]) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const hint = groupSharedPickerHint(input.kind)

  const handleConfirm = (selection: GroupPickerSelection[]) => {
    setPickerOpen(false)
    input.onAdd(selection)
  }

  return {
    pickerOpen,
    setPickerOpen,
    hint,
    handleConfirm,
  }
}

export function useGroupActivityPane(events: GroupActivity[]) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const sorted = useMemo(() => sortGroupActivities(events), [events])
  return { now, sorted }
}
