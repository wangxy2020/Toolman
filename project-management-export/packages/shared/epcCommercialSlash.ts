import {
  EPC_COMMERCIAL_COMMAND_DESCRIPTION,
  EPC_COMMERCIAL_COMMAND_TEMPLATE,
  EPC_WORK1_BOQ_FORMAT_COMMAND_DESCRIPTION,
  EPC_WORK1_BOQ_FORMAT_COMMAND_TEMPLATE,
  EPC_WORK2_SHIPPING_CI_COMMAND_DESCRIPTION,
  EPC_WORK2_SHIPPING_CI_COMMAND_TEMPLATE,
  EPC_WORK5_PAYMENT_COMMAND_DESCRIPTION,
  EPC_WORK5_PAYMENT_COMMAND_TEMPLATE
} from './epcCommercialTypes'

const LEGACY_EPC_COMMAND_REGEX = /^epc\s+\S+\s+schx-ipc[\w-]*\s+to\s+boq\s*$/i

const normalizeSlashCommandText = (command: string): string => command.trim().replace(/^\//, '')

const normalizedWork4BoqTemplateBody = () => normalizeSlashCommandText(EPC_COMMERCIAL_COMMAND_TEMPLATE)
const normalizedWork1BoqFormatBody = () => normalizeSlashCommandText(EPC_WORK1_BOQ_FORMAT_COMMAND_TEMPLATE)
const normalizedWork2ShippingCiBody = () => normalizeSlashCommandText(EPC_WORK2_SHIPPING_CI_COMMAND_TEMPLATE)
const normalizedPaymentTemplateBody = () => normalizeSlashCommandText(EPC_WORK5_PAYMENT_COMMAND_TEMPLATE)

/** 旧版斜杠命令（含 project_id） */
export const isLegacyEpcSlashCommand = (command: string): boolean => {
  return LEGACY_EPC_COMMAND_REGEX.test(normalizeSlashCommandText(command))
}

export type EpcSlashCommandLike = { command: string; description?: string }

const hasWork4BoqSlashCommand = (commands: EpcSlashCommandLike[]): boolean =>
  commands.some((cmd) => {
    const normalized = normalizeSlashCommandText(cmd.command)
    return normalized === normalizedWork4BoqTemplateBody() || /^epc\s+\S+\s+to\s+boq\s*$/i.test(normalized)
  })

const hasWork1BoqFormatSlashCommand = (commands: EpcSlashCommandLike[]): boolean =>
  commands.some((cmd) => {
    const normalized = normalizeSlashCommandText(cmd.command)
    return normalized === normalizedWork1BoqFormatBody() || /^epc\s+boq\s+format\s*$/i.test(normalized)
  })

const hasWork2ShippingCiSlashCommand = (commands: EpcSlashCommandLike[]): boolean =>
  commands.some((cmd) => {
    const normalized = normalizeSlashCommandText(cmd.command)
    return (
      normalized === normalizedWork2ShippingCiBody() ||
      /^epc\s+shipping\s+ci\s+to\s+progress\s+ci\s+and\s+ipc\s*$/i.test(normalized)
    )
  })

const hasPaymentSlashCommand = (commands: EpcSlashCommandLike[]): boolean =>
  commands.some((cmd) => {
    const normalized = normalizeSlashCommandText(cmd.command)
    return normalized === normalizedPaymentTemplateBody() || /^epc\s+\S+\s+to\s+payment\s*$/i.test(normalized)
  })

/** 替换会话中缓存的旧 EPC 命令，并确保存在工作 4 / 工作 5 模板命令 */
export const normalizeEpcSlashCommands = <T extends EpcSlashCommandLike>(commands: T[]): T[] => {
  const withoutLegacy = commands.filter((cmd) => !isLegacyEpcSlashCommand(cmd.command))

  const builtins: T[] = []
  if (!hasWork1BoqFormatSlashCommand(withoutLegacy)) {
    builtins.push({
      command: EPC_WORK1_BOQ_FORMAT_COMMAND_TEMPLATE,
      description: EPC_WORK1_BOQ_FORMAT_COMMAND_DESCRIPTION
    } as T)
  }
  if (!hasWork2ShippingCiSlashCommand(withoutLegacy)) {
    builtins.push({
      command: EPC_WORK2_SHIPPING_CI_COMMAND_TEMPLATE,
      description: EPC_WORK2_SHIPPING_CI_COMMAND_DESCRIPTION
    } as T)
  }
  if (!hasWork4BoqSlashCommand(withoutLegacy)) {
    builtins.push({
      command: EPC_COMMERCIAL_COMMAND_TEMPLATE,
      description: EPC_COMMERCIAL_COMMAND_DESCRIPTION
    } as T)
  }
  if (!hasPaymentSlashCommand(withoutLegacy)) {
    builtins.push({
      command: EPC_WORK5_PAYMENT_COMMAND_TEMPLATE,
      description: EPC_WORK5_PAYMENT_COMMAND_DESCRIPTION
    } as T)
  }

  if (builtins.length === 0) {
    return withoutLegacy
  }

  return [...builtins, ...withoutLegacy]
}
