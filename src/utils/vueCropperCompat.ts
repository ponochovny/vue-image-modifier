export const resolveVueCropperComponent = <T>(
  input: T | { default: T } | { __esModule?: boolean; default?: T },
): T => {
  if (input && typeof input === 'object' && 'default' in input && input.default) {
    return input.default as T
  }

  return input as T
}
