export function normalizePhone(value: string) {
  const trimmed = value.trim()
  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '')
  return `${hasPlus ? '+' : ''}${digits}`
}
