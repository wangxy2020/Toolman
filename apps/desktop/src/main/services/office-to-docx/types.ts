export type OfficeToDocxMethod =
  | 'copy'
  | 'office-oxide'
  | 'libreoffice'
  | 'microsoft-word'
  | 'plaintext'

export interface OfficeConversionCapabilities {
  libreOffice: boolean
  microsoftWordMac: boolean
  microsoftWordWindows: boolean
}

export class OfficeToDocxError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OfficeToDocxError'
  }
}
