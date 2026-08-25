export function ok<T>(data: T, message = 'success') {
  return { success: true, data, message }
}

export function fail(message: string, code?: string) {
  return { success: false as const, data: null, message, code }
}
