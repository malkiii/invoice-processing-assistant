import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { renderDocxForViewing } from './docx-view'

describe('renderDocxForViewing', () => {
  it('renders a Word Document as a standalone HTML page showing its text', async () => {
    const bytes = await readFile(new URL('../../../tests/fixtures/invoices/docx-invoice.docx', import.meta.url))
    const html = await renderDocxForViewing(new Uint8Array(bytes))
    expect(html).toMatch(/^<!doctype html>/i)
    expect(html).toContain('Studio Lumen')
    expect(html).toContain('INVOICE SL-2026-012')
    expect(html).not.toMatch(/<script/i)
  })

  it('shows a message for a damaged file instead of throwing', async () => {
    const html = await renderDocxForViewing(new Uint8Array([1, 2, 3]))
    expect(html).toContain('could not be shown')
  })
})
