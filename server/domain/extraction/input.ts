/**
 * Presents a Document to the model according to its Model Capability (ADR 0004):
 * PDFs and images go natively to capable models; everything else becomes markdown text.
 */
import { Readability } from '@mozilla/readability'
import type { FilePart, TextPart } from 'ai'
import { parseHTML } from 'linkedom'
import mammoth from 'mammoth'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import { extractText, getDocumentProxy } from 'unpdf'
import { MIME_TYPES, type DocumentFormat } from '../document-inspection'
import type { ModelCapability } from '../model-capability'

export type InputPart = TextPart | FilePart

/** Inline bytes as a file part; AI SDK 7 deprecates the separate "image" part type. */
function filePart(bytes: Uint8Array, mediaType: string): FilePart {
  return { type: 'file', data: { type: 'data', data: bytes }, mediaType }
}

/** Renders every page of a PDF to a PNG. */
export type PdfRasterizer = (pdf: Uint8Array) => Promise<Uint8Array[]>

export interface DocumentInput {
  bytes: Uint8Array
  format: DocumentFormat
}

/** The Document cannot be presented to this model. The message is shown to the User. */
export class InputPreparationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InputPreparationError'
  }
}

function asText(heading: string, body: string): TextPart {
  return { type: 'text', text: `${heading}\n\n${body.trim()}` }
}

async function pdfPagesText(bytes: Uint8Array): Promise<string[]> {
  // pdf.js may detach the buffer it is given; work on a copy.
  const pdf = await getDocumentProxy(new Uint8Array(bytes))
  try {
    const { text } = await extractText(pdf, { mergePages: false })
    return text
  } finally {
    await pdf.cleanup?.()
  }
}

function turndown(html: string): string {
  const service = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' })
  service.use(gfm)
  service.remove(['script', 'style', 'noscript', 'iframe', 'object', 'embed', 'img'] as unknown as TurndownService.Filter)
  return service.turndown(html)
}

/** Above this much body markdown, a page is treated as noisy and narrowed down with Readability. */
const READABILITY_THRESHOLD_CHARS = 30_000

/**
 * Readable markdown from an HTML page, headed by its title. Invoice pages are usually short and
 * keep vendor details in headers and footers, which Readability strips, so the whole body is used
 * unless the page is long; Readability's article is used only when it keeps every table.
 */
export function htmlToMarkdown(html: string): string {
  const { document } = parseHTML(html)
  for (const el of document.querySelectorAll('script, style, noscript, template')) el.remove()
  const title = document.title?.trim()
  const withTitle = (markdown: string) => (title ? `# ${title}\n\n${markdown}` : markdown)
  const bodyMarkdown = turndown(document.body?.innerHTML ?? html)
  if (bodyMarkdown.length <= READABILITY_THRESHOLD_CHARS) return withTitle(bodyMarkdown)

  let articleHtml = ''
  try {
    articleHtml = new Readability(document.cloneNode(true) as never).parse()?.content ?? ''
  } catch {
    articleHtml = ''
  }
  const articleTables = (articleHtml.match(/<table[\s>]/gi) ?? []).length
  const keepsTables = articleTables >= document.querySelectorAll('table').length
  return withTitle(articleHtml && keepsTables ? turndown(articleHtml) : bodyMarkdown)
}

async function docxToMarkdown(bytes: Uint8Array): Promise<string> {
  let html: string
  try {
    ;({ value: html } = await mammoth.convertToHtml(
      { buffer: Buffer.from(bytes) },
      // Embedded images would bloat the prompt as base64; text models cannot read them anyway.
      { convertImage: mammoth.images.imgElement(async () => ({ src: '' })) },
    ))
  } catch {
    throw new InputPreparationError('The Word file could not be read; it may be damaged.')
  }
  return turndown(html)
}

const MAX_TEXT_CHARS = 400_000

function limitText(markdown: string): string {
  if (markdown.trim().length === 0) throw new InputPreparationError('The Document contains no readable text.')
  return markdown.length > MAX_TEXT_CHARS ? markdown.slice(0, MAX_TEXT_CHARS) : markdown
}

/**
 * Turns a Document into the content parts of the model's user message.
 * Throws InputPreparationError when this model cannot read this Document.
 */
export async function prepareInput(
  doc: DocumentInput,
  capability: ModelCapability,
  deps: { rasterizePdf: PdfRasterizer },
): Promise<InputPart[]> {
  switch (doc.format) {
    case 'pdf': {
      if (capability === 'pdf') return [filePart(doc.bytes, MIME_TYPES.pdf)]
      if (capability === 'images') {
        const pages = await deps.rasterizePdf(doc.bytes)
        return [
          { type: 'text', text: `The document is a PDF of ${pages.length} page(s), shown as one image per page.` },
          ...pages.map((image) => filePart(image, 'image/png')),
        ]
      }
      let pages: string[]
      try {
        pages = await pdfPagesText(doc.bytes)
      } catch {
        throw new InputPreparationError('The PDF could not be read; it may be damaged.')
      }
      if (pages.every((page) => page.trim().length === 0)) {
        throw new InputPreparationError(
          'The PDF has no text layer (it looks scanned) and this model is text-only. Re-run it with a vision model.',
        )
      }
      const body = pages.map((page, i) => `## Page ${i + 1}\n\n${page.trim()}`).join('\n\n')
      return [asText('The document is a PDF; its extracted text follows.', limitText(body))]
    }
    case 'png':
    case 'jpeg':
    case 'webp':
      if (capability === 'text') {
        throw new InputPreparationError('This model is text-only and cannot read images. Re-run it with a vision model.')
      }
      return [filePart(doc.bytes, MIME_TYPES[doc.format])]
    case 'docx':
      return [asText('The document is a Word file, converted to markdown:', limitText(await docxToMarkdown(doc.bytes)))]
    case 'html': {
      const html = new TextDecoder('utf-8').decode(doc.bytes)
      return [asText('The document is a web page, converted to markdown:', limitText(htmlToMarkdown(html)))]
    }
  }
}
