/** @deprecated 修订层已统一至 projectManagementRevision；普通对话即可改表，不再单独拦截发送流程 */
export const tryRunEpcDataUpdateCommand = async (_params: unknown): Promise<boolean> => false

export { isEpcDataTableUpdateRequest } from '@shared/epcDataUpdate'
