import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { makePdf, makeTextPdf } from '../../../tests/fixtures/documents/make'
import { createPdftoppmRasterizer } from './rasterize'

function hasPdftoppm(): boolean {
  try {
    execFileSync('pdftoppm', ['-v'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47]

describe.skipIf(!hasPdftoppm())('pdftoppm rasteriser', () => {
  it('renders each page of a PDF to a PNG, in page order', async () => {
    const rasterize = createPdftoppmRasterizer({ dpi: 50 })
    const pages = await rasterize(await makeTextPdf([['Page one'], ['Page two'], ['Page three']]))
    expect(pages).toHaveLength(3)
    for (const page of pages) expect([...page.subarray(0, 4)]).toEqual(PNG_SIGNATURE)
  })

  it('fails on bytes that are not a PDF', async () => {
    await expect(createPdftoppmRasterizer()(new TextEncoder().encode('not a pdf'))).rejects.toThrow(/render/i)
  })

  it('renders at most maxPages pages', async () => {
    const pages = await createPdftoppmRasterizer({ dpi: 30, maxPages: 2 })(await makePdf(4))
    expect(pages).toHaveLength(2)
  })
})
