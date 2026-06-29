import type { ReactNode } from 'react'

export function ChannelFormLabel({
  children,
  required,
  htmlFor,
}: {
  children: ReactNode
  required?: boolean
  htmlFor?: string
}) {
  return (
    <label className="tm-channel-config-label" htmlFor={htmlFor}>
      {children}
      {required ? <span className="tm-channel-config-required">*</span> : null}
    </label>
  )
}
