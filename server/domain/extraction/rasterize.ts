import { execFile } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { InputPreparationError, type PdfRasterizer } from './input'

const run = promisify(execFile)

export interface RasterizerOptions {
  /** Path or name of the poppler `pdftoppm` binary (installed in the Docker image). */
  binary?: string
  /** Resolution; 150 dpi keeps invoices legible without blowing up token costs. */
  dpi?: number
  /** Pages beyond this are not rendered. Documents are already capped by the page limit (ADR 0007). */
  maxPages?: number
}

/** Rasterises PDFs with poppler's `pdftoppm`, one PNG per page. */
export function createPdftoppmRasterizer(options: RasterizerOptions = {}): PdfRasterizer {
  const binary = options.binary ?? process.env.PDFTOPPM_PATH ?? 'pdftoppm'
  const dpi = options.dpi ?? 150
  const maxPages = options.maxPages ?? 30

  return async (pdf) => {
    const dir = await mkdtemp(join(tmpdir(), 'raster-'))
    try {
      const input = join(dir, 'in.pdf')
      await writeFile(input, pdf)
      try {
        await run(binary, ['-r', String(dpi), '-png', '-f', '1', '-l', String(maxPages), input, join(dir, 'page')], {
          timeout: 120_000,
        })
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        throw new InputPreparationError(`The PDF pages could not be rendered as images (${detail.slice(0, 200)}).`)
      }
      // pdftoppm zero-pads page numbers to the page count's width, so a name sort is page order.
      const files = (await readdir(dir)).filter((f) => f.startsWith('page') && f.endsWith('.png')).sort()
      return Promise.all(files.map(async (f) => new Uint8Array(await readFile(join(dir, f)))))
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }
}
