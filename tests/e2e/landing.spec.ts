import { devices, expect, test, type Page } from '@playwright/test'

const EFFECTS = ['lens', 'receipt', 'stamp', 'particles', 'ruler', 'scanner'] as const

/** Counts live pointer/mouse listeners and animation-frame requests, to catch leaks. */
async function instrument(page: Page) {
  await page.addInitScript(() => {
    const live = new Map<string, number>()
    const key = (type: string) => (/^(pointer|mouse|click)/.test(type) ? type : null)
    const add = EventTarget.prototype.addEventListener
    const remove = EventTarget.prototype.removeEventListener
    const seen = new WeakMap<object, Set<string>>()
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      const k = key(type)
      if (k && listener) {
        const set = seen.get(listener) ?? new Set()
        const id = `${k}:${typeof options === 'object' ? !!options?.capture : !!options}`
        if (!set.has(id)) live.set(k, (live.get(k) ?? 0) + 1)
        set.add(id)
        seen.set(listener, set)
      }
      return add.call(this, type, listener, options)
    }
    EventTarget.prototype.removeEventListener = function (type, listener, options) {
      const k = key(type)
      if (k && listener) {
        const set = seen.get(listener)
        const id = `${k}:${typeof options === 'object' ? !!options?.capture : !!options}`
        if (set?.delete(id)) live.set(k, (live.get(k) ?? 0) - 1)
      }
      return remove.call(this, type, listener, options)
    }
    let frames = 0
    const raf = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = (callback) => {
      frames++
      return raf(callback)
    }
    Object.assign(window, {
      __pointerListeners: () => [...live.values()].reduce((sum, n) => sum + n, 0),
      __frames: () => frames,
    })
  })
}

const pointerListeners = (page: Page) => page.evaluate(() => (window as any).__pointerListeners() as number)
const frames = (page: Page) => page.evaluate(() => (window as any).__frames() as number)

test.describe('landing cursor effects', () => {
  for (const effect of EFFECTS) {
    test(`?cursor=${effect} renders the ${effect} effect`, async ({ page }) => {
      await page.goto(`/?cursor=${effect}`)
      await expect(page.locator(`[data-effect="${effect}"]`)).toBeAttached()
      await expect(page.getByRole('button', { name: new RegExp(`^${effect}$`, 'i') })).toHaveAttribute('aria-pressed', 'true')
      await expect(page.locator('[data-effect]')).toHaveCount(1)
    })
  }

  test('switching effects cleans up the previous one without leaking listeners or frame loops', async ({ page }) => {
    await instrument(page)
    // Start from a mounted effect so the page is hydrated, then turn it off for the baseline.
    await page.goto('/?cursor=lens')
    await expect(page.locator('[data-effect="lens"]')).toBeAttached()
    await page.getByRole('button', { name: /^off$/i }).click()
    await expect(page.locator('[data-effect]')).toHaveCount(0)
    const baseline = await pointerListeners(page)

    for (const effect of EFFECTS) {
      await page.getByRole('button', { name: new RegExp(`^${effect}$`, 'i') }).click()
      await expect(page.locator(`[data-effect="${effect}"]`)).toBeAttached()
      await expect(page.locator('[data-effect]')).toHaveCount(1)
      await expect(page).toHaveURL(new RegExp(`cursor=${effect}`))
    }

    await page.getByRole('button', { name: /^off$/i }).click()
    await expect(page.locator('[data-effect]')).toHaveCount(0)
    expect(await pointerListeners(page)).toBe(baseline)

    await page.waitForTimeout(200)
    const before = await frames(page)
    await page.waitForTimeout(400)
    expect(await frames(page)).toBe(before)
  })

  test('the URL wins over the remembered choice', async ({ page }) => {
    await page.goto('/?cursor=ruler')
    // The effect only mounts after hydration, so the switcher is interactive from here on.
    await expect(page.locator('[data-effect="ruler"]')).toBeAttached()
    await page.getByRole('button', { name: /^stamp$/i }).click()
    await expect(page).toHaveURL(/cursor=stamp/)
    await page.goto('/')
    await expect(page.locator('[data-effect="stamp"]')).toBeAttached()
    await page.goto('/?cursor=scanner')
    await expect(page.locator('[data-effect="scanner"]')).toBeAttached()
  })

  test('with reduced motion the hero is static and the switcher says why', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/?cursor=lens')
    await expect(page.getByRole('status')).toContainText('reduced motion')
    await expect(page.locator('[data-effect]')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^lens$/i })).toBeDisabled()
  })
})

test.describe('landing on a touch screen', () => {
  const { defaultBrowserType: _, ...pixel } = devices['Pixel 7']
  test.use(pixel)

  test('the hero is static and the switcher says why', async ({ page }) => {
    await page.goto('/?cursor=particles')
    await expect(page.getByRole('status')).toContainText('touch')
    await expect(page.locator('[data-effect]')).toHaveCount(0)
  })
})
