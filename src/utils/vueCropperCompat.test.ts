import { describe, expect, it } from 'vitest'
import { resolveVueCropperComponent } from './vueCropperCompat'

describe('resolveVueCropperComponent', () => {
  it('unwraps a module namespace object from vue-cropperjs', () => {
    const component = { render: () => null }
    const namespace = { __esModule: true, default: component }

    expect(resolveVueCropperComponent(namespace)).toBe(component)
  })

  it('returns the component as-is when it is already unwrapped', () => {
    const component = { render: () => null }

    expect(resolveVueCropperComponent(component)).toBe(component)
  })
})
