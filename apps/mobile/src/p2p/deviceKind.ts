/** Native app is 移动; browser preview / hosted web is 网页. */
export function localP2pClientDeviceKind(): 'mobile' | 'web' {
  return typeof document !== 'undefined' ? 'web' : 'mobile'
}
