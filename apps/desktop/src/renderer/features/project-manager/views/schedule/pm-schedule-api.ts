import {
  IpcChannel,
  type PmBaselineRestoreOutput,
  type PmScheduleBaseline,
  type PmWorkItemRelation,
} from '@toolman/shared'

async function invoke<T>(channel: IpcChannel, input?: unknown): Promise<T> {
  const result = await window.api.invoke(channel, input)
  if (!result.ok) {
    throw new Error(result.error.message)
  }
  return result.data as T
}

export const pmScheduleApi = {
  listRelations(workspaceId: string, projectId: string) {
    return invoke<{ relations: PmWorkItemRelation[] }>(IpcChannel.Pm_RelationList, {
      workspaceId,
      projectId,
    })
  },

  listBaselines(workspaceId: string, projectId: string) {
    return invoke<{ baselines: PmScheduleBaseline[] }>(IpcChannel.Pm_BaselineList, {
      workspaceId,
      projectId,
    })
  },

  createBaseline(
    workspaceId: string,
    projectId: string,
    options?: { name?: string; asOfDate?: string },
  ) {
    return invoke<PmScheduleBaseline>(IpcChannel.Pm_BaselineCreate, {
      workspaceId,
      projectId,
      ...(options?.name ? { name: options.name } : {}),
      ...(options?.asOfDate ? { asOfDate: options.asOfDate } : {}),
    })
  },

  updateBaseline(id: string, options: { name?: string; asOfDate?: string }) {
    return invoke<PmScheduleBaseline>(IpcChannel.Pm_BaselineUpdate, {
      id,
      ...(options.name ? { name: options.name } : {}),
      ...(options.asOfDate ? { asOfDate: options.asOfDate } : {}),
    })
  },

  createRelation(input: {
    workspaceId: string
    projectId: string
    fromWorkItemId: string
    toWorkItemId: string
    type?: PmWorkItemRelation['type']
    lagDays?: number
  }) {
    return invoke<PmWorkItemRelation>(IpcChannel.Pm_RelationCreate, input)
  },

  deleteRelation(id: string) {
    return invoke<{ ok: boolean }>(IpcChannel.Pm_RelationDelete, { id })
  },

  deleteBaseline(id: string, options?: { allowVersionPlan?: boolean }) {
    return invoke<{ ok: boolean }>(IpcChannel.Pm_BaselineDelete, {
      id,
      ...(options?.allowVersionPlan ? { allowVersionPlan: true } : {}),
    })
  },

  getBaseline(id: string) {
    return invoke<PmScheduleBaseline>(IpcChannel.Pm_BaselineGet, { id })
  },

  restoreBaseline(id: string) {
    return invoke<PmBaselineRestoreOutput>(IpcChannel.Pm_BaselineRestore, { id })
  },
}
