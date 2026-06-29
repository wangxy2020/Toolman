export function McpServerEditFormLabel({
  children,
  required,
  hint,
  htmlFor,
}: {
  children: string
  required?: boolean
  hint?: string
  htmlFor?: string
}) {
  return (
    <label className="tm-mcp-form-label" htmlFor={htmlFor}>
      {children}
      {required ? <span className="tm-mcp-form-required">*</span> : null}
      {hint ? (
        <span className="tm-mcp-form-help" title={hint} aria-label={hint}>
          ⓘ
        </span>
      ) : null}
    </label>
  )
}
