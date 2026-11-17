/**
 * Copy and sample data shared by every landing page version, so the four designs tell
 * the same story about the same product and only differ in how they show it.
 */

export const landingVersions = [
  { id: 'journey', label: 'Journey' },
  { id: 'bento', label: 'Bento' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'paper', label: 'Paper' },
] as const

export type LandingVersion = (typeof landingVersions)[number]['id']

export function isLandingVersion(value: unknown): value is LandingVersion {
  return landingVersions.some((v) => v.id === value)
}

export const headline = {
  title: 'Turn invoice files into clean, reviewable data.',
  lead: 'Drop in PDFs, scans, photos or links. Your own LLM fills the Fields you define, deterministic Checks flag anything that does not add up, and you export CSV, XLSX or JSON.',
}

export interface SampleLineItem {
  description: string
  qty: number
  unitPrice: number
  amount: number
}

/**
 * The sample Invoice every version walks through. The model misreads the total as
 * 1,204.00 (a digit swap) so the "subtotal + tax = total" Check has something to flag,
 * and the Review step corrects it to 1,240.00.
 */
export const sampleInvoice = {
  vendor: 'Northwind Paper Co.',
  vatId: 'FR40303265045',
  number: 'INV-2026-0418',
  issueDate: '2026-11-14',
  dueDate: '2026-12-14',
  currency: 'EUR',
  lineItems: [
    { description: 'A4 copy paper, box', qty: 40, unitPrice: 12, amount: 480 },
    { description: 'Toner cartridge', qty: 6, unitPrice: 92.22, amount: 553.33 },
  ] satisfies SampleLineItem[],
  subtotal: 1033.33,
  tax: 206.67,
  rawTotal: 1204,
  correctedTotal: 1240,
}

export function money(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** The fields of the sample Invoice as the Review screen lists them. */
export const sampleFields = [
  { key: 'vendor_name', value: sampleInvoice.vendor },
  { key: 'invoice_number', value: sampleInvoice.number },
  { key: 'invoice_date', value: sampleInvoice.issueDate },
  { key: 'due_date', value: sampleInvoice.dueDate },
  { key: 'currency', value: sampleInvoice.currency },
  { key: 'subtotal', value: money(sampleInvoice.subtotal) },
  { key: 'tax_amount', value: money(sampleInvoice.tax) },
  { key: 'total_amount', value: money(sampleInvoice.rawTotal) },
] as const

export interface CheckInput {
  lineAmounts: number[]
  subtotal: number
  tax: number
  total: number
  issueDate: string
  dueDate: string
  currency: string
}

export interface CheckResult {
  id: string
  label: string
  pass: boolean
  detail: string
}

const ISO_CURRENCIES = new Set(['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'SEK', 'NOK', 'DKK', 'PLN', 'MAD'])
const close = (a: number, b: number) => Math.abs(a - b) < 0.015

/** A landing-page sized version of the real Checks, run live in the Bento demo. */
export function runSampleChecks(input: CheckInput): CheckResult[] {
  const lineSum = input.lineAmounts.reduce((s, n) => s + n, 0)
  const issue = Date.parse(input.issueDate)
  const due = Date.parse(input.dueDate)
  return [
    {
      id: 'lines',
      label: 'Line items add up to subtotal',
      pass: close(lineSum, input.subtotal),
      detail: `${money(lineSum)} vs ${money(input.subtotal)}`,
    },
    {
      id: 'total',
      label: 'Subtotal + tax = total',
      pass: close(input.subtotal + input.tax, input.total),
      detail: `${money(input.subtotal + input.tax)} vs ${money(input.total)}`,
    },
    {
      id: 'dates',
      label: 'Due date is not before issue date',
      pass: !Number.isNaN(issue) && !Number.isNaN(due) && due >= issue,
      detail: `${input.issueDate} → ${input.dueDate}`,
    },
    {
      id: 'currency',
      label: 'Currency is a valid ISO 4217 code',
      pass: ISO_CURRENCIES.has(input.currency.toUpperCase()),
      detail: input.currency || '(empty)',
    },
  ]
}

export const steps = [
  {
    n: '01',
    title: 'Add',
    body: 'Upload files or whole folders, or paste URLs. PDF, DOCX, images and HTML, up to 25 MB and 30 pages each by default.',
  },
  {
    n: '02',
    title: 'Extract',
    body: 'Your LLM fills the Fields of a Template you control, then deterministic Checks run on every Invoice.',
  },
  {
    n: '03',
    title: 'Review & export',
    body: 'Fix what the Checks flag with the Document beside you, mark Invoices reviewed, and export CSV, XLSX or JSON.',
  },
] as const

export const features = [
  {
    id: 'intake',
    kicker: 'Intake',
    title: 'Any file, any source',
    body: 'Drag in files or folders, or paste links. Each drop becomes a Batch you can follow live. Google Drive and Dropbox are coming soon.',
  },
  {
    id: 'templates',
    kicker: 'Templates',
    title: 'You decide the Fields',
    body: 'Start from the built-in Template or clone it. Fields can be values, groups or repeating lists such as line items, each with a hint for the model.',
  },
  {
    id: 'extract',
    kicker: 'Extraction',
    title: 'The right input for each model',
    body: 'Native-PDF models read the PDF itself, vision models get page images, and text-only models get the extracted text. Every run freezes a snapshot of its Template.',
  },
  {
    id: 'checks',
    kicker: 'Checks',
    title: 'Numbers that have to add up',
    body: 'Line items against the subtotal, subtotal plus tax against the total, plus date order, currency codes, required Fields and possible duplicates. These are plain code, no LLM involved.',
  },
  {
    id: 'review',
    kicker: 'Review',
    title: 'Correct with the source beside you',
    body: 'Edit any value inline with the Document next to it. Raw Values are never overwritten, so every correction can be reverted.',
  },
  {
    id: 'export',
    kicker: 'Export',
    title: 'Clean files out',
    body: 'Export CSV (flat or as a zip of two linked files), XLSX with Invoices and Line items sheets, or nested JSON, optionally limited to Reviewed Invoices.',
  },
] as const

export const providers = [
  { name: 'Anthropic', note: 'Native PDF' },
  { name: 'OpenAI', note: 'Native PDF' },
  { name: 'Google Gemini', note: 'Native PDF' },
  { name: 'Mistral', note: 'Vision' },
  { name: 'OpenRouter', note: 'Many models' },
  { name: 'Ollama', note: 'Runs locally' },
  { name: 'OpenAI-compatible', note: 'Any base URL' },
] as const

export const faqs = [
  {
    q: 'Which LLM providers can I use?',
    a: 'OpenAI, Anthropic, Google Gemini, Mistral, OpenRouter, Ollama, or any OpenAI-compatible endpoint with a base URL and key. You can save several connections and pick a default model for each.',
  },
  {
    q: 'Where do my API keys and files live?',
    a: 'On your instance. Keys are encrypted at rest, and files go to the S3-compatible storage you configure, such as MinIO, R2 or S3.',
  },
  {
    q: 'What if the model gets a value wrong?',
    a: 'Checks flag Invoices whose numbers or dates do not add up. You correct the value next to the Document, and the original Raw Value is kept so you can always revert.',
  },
  {
    q: 'Can I change which Fields are extracted?',
    a: 'Yes. Clone the default Template and add, remove or describe Fields, including groups and repeating lists. Every Extraction stores a snapshot of the Template it used.',
  },
  {
    q: 'Which files and sizes are supported?',
    a: 'PDF, DOCX, images and HTML, from uploads, folders or URLs. Documents are limited to 25 MB and 30 pages by default, and the Admin can change both limits.',
  },
  {
    q: 'Can my team use one instance?',
    a: 'Yes. The first person to sign up becomes Admin and can keep sign-up open or invite-only. Each User only sees their own Documents, and that includes the Admin.',
  },
] as const
