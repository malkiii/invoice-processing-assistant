/**
 * The fixture set: about 15 sample invoices across every accepted format, with the Invoices a
 * correct Extraction (built-in default Template) should produce. `generate.ts` renders the files
 * from this data; the fixture test replays it against a mocked LLM, or a real one with EVAL=1.
 */
import type { DocumentFormat } from '../../../server/domain/document-inspection'

export interface LineItem {
  description: string
  quantity: number | null
  unit_price: number | null
  amount: number
  tax_rate: number | null
}

export interface Party {
  name: string
  address: string | null
  tax_id: string | null
}

export interface ExpectedInvoice {
  vendor: Party
  buyer: Party
  invoice_number: string
  issue_date: string
  due_date: string | null
  currency: string
  line_items: LineItem[]
  subtotal: number
  tax_total: number
  total: number
  payment_terms: string | null
}

export interface FixtureCase {
  file: string
  format: DocumentFormat
  /** How the file is rendered (see generate.ts). */
  style: 'text-pdf' | 'scanned-pdf' | 'image' | 'docx' | 'html-table' | 'html-email'
  /** A scanned PDF has no text layer, so a text-only model cannot read it. */
  scanned?: boolean
  invoices: ExpectedInvoice[]
}

const round = (n: number) => Math.round(n * 100) / 100

function line(description: string, quantity: number, unitPrice: number, taxRate: number | null): LineItem {
  return { description, quantity, unit_price: unitPrice, amount: round(quantity * unitPrice), tax_rate: taxRate }
}

function invoice(base: Omit<ExpectedInvoice, 'subtotal' | 'tax_total' | 'total'>): ExpectedInvoice {
  const subtotal = round(base.line_items.reduce((sum, l) => sum + l.amount, 0))
  const tax = round(base.line_items.reduce((sum, l) => sum + (l.amount * (l.tax_rate ?? 0)) / 100, 0))
  return { ...base, subtotal, tax_total: tax, total: round(subtotal + tax) }
}

const acme: Party = { name: 'Acme Software GmbH', address: 'Hauptstrasse 12, 10115 Berlin, Germany', tax_id: 'DE298765432' }
const globex: Party = { name: 'Globex Trading Ltd', address: '221 Baker Street, London NW1 6XE, United Kingdom', tax_id: 'GB123456789' }
const initech: Party = { name: 'Initech LLC', address: '4120 Freidrich Lane, Austin, TX 78744, USA', tax_id: '74-3012345' }
const northwind: Party = { name: 'Northwind Supplies Inc.', address: '500 Market St, San Francisco, CA 94105, USA', tax_id: '94-1234567' }
const umbrella: Party = { name: 'Umbrella Logistics SARL', address: '18 Rue de Rivoli, 75004 Paris, France', tax_id: 'FR40123456789' }
const helvetia: Party = { name: 'Helvetia Print AG', address: 'Bahnhofstrasse 7, 8001 Zurich, Switzerland', tax_id: 'CHE-123.456.789' }
const contoso: Party = { name: 'Contoso Cafe', address: '12 Harbour Road, Dublin 4, Ireland', tax_id: 'IE6388047V' }

export const CASES: FixtureCase[] = [
  {
    file: 'pdf-simple-eur.pdf',
    format: 'pdf',
    style: 'text-pdf',
    invoices: [
      invoice({
        vendor: acme,
        buyer: globex,
        invoice_number: 'AC-2026-0141',
        issue_date: '2026-03-02',
        due_date: '2026-04-01',
        currency: 'EUR',
        line_items: [line('Software licence (annual)', 1, 1200, 19), line('Onboarding workshop', 2, 450, 19)],
        payment_terms: 'Net 30',
      }),
    ],
  },
  {
    file: 'pdf-us-sales-tax.pdf',
    format: 'pdf',
    style: 'text-pdf',
    invoices: [
      invoice({
        vendor: northwind,
        buyer: initech,
        invoice_number: 'NW-88213',
        issue_date: '2026-02-14',
        due_date: '2026-03-16',
        currency: 'USD',
        line_items: [
          line('Printer paper A4, box of 5 reams', 10, 32.5, 8.875),
          line('Toner cartridge black', 4, 89.99, 8.875),
          line('Desk organiser', 6, 14.25, 8.875),
          line('USB-C hub', 3, 49, 8.875),
        ],
        payment_terms: 'Net 30',
      }),
    ],
  },
  {
    file: 'pdf-two-invoices.pdf',
    format: 'pdf',
    style: 'text-pdf',
    invoices: [
      invoice({
        vendor: umbrella,
        buyer: acme,
        invoice_number: 'UL-5501',
        issue_date: '2026-01-10',
        due_date: '2026-02-09',
        currency: 'EUR',
        line_items: [line('Freight Paris - Berlin, pallet', 3, 280, 20)],
        payment_terms: 'Net 30',
      }),
      invoice({
        vendor: umbrella,
        buyer: acme,
        invoice_number: 'UL-5502',
        issue_date: '2026-01-24',
        due_date: '2026-02-23',
        currency: 'EUR',
        line_items: [line('Freight Paris - Munich, pallet', 2, 310, 20), line('Insurance surcharge', 1, 45, 20)],
        payment_terms: 'Net 30',
      }),
    ],
  },
  {
    file: 'pdf-three-invoices.pdf',
    format: 'pdf',
    style: 'text-pdf',
    invoices: [1, 2, 3].map((n) =>
      invoice({
        vendor: contoso,
        buyer: globex,
        invoice_number: `CC-31${n}`,
        issue_date: `2026-04-0${n}`,
        due_date: null,
        currency: 'EUR',
        line_items: [line('Catering lunch, per person', 8 + n, 18.5, 13.5)],
        payment_terms: 'Due on receipt',
      }),
    ),
  },
  {
    file: 'pdf-gbp-no-due-date.pdf',
    format: 'pdf',
    style: 'text-pdf',
    invoices: [
      invoice({
        vendor: globex,
        buyer: { name: 'Jane Doe', address: '9 Elm Grove, Bristol BS1 4ND, United Kingdom', tax_id: null },
        invoice_number: 'GT-0093',
        issue_date: '2026-05-19',
        due_date: null,
        currency: 'GBP',
        line_items: [line('Antique oak bookcase', 1, 640, 20), line('Delivery', 1, 35, 20)],
        payment_terms: 'Due on receipt',
      }),
    ],
  },
  {
    file: 'pdf-reverse-charge.pdf',
    format: 'pdf',
    style: 'text-pdf',
    invoices: [
      invoice({
        vendor: helvetia,
        buyer: acme,
        invoice_number: 'HP-2026-77',
        issue_date: '2026-06-03',
        due_date: '2026-07-03',
        currency: 'EUR',
        line_items: [line('Brochure printing, 2000 copies', 1, 2150, 0), line('Design adjustments (hours)', 3, 95, 0)],
        payment_terms: 'Net 30, reverse charge: VAT to be accounted for by the recipient',
      }),
    ],
  },
  {
    file: 'pdf-many-lines-chf.pdf',
    format: 'pdf',
    style: 'text-pdf',
    invoices: [
      invoice({
        vendor: helvetia,
        buyer: { name: 'Bern Events GmbH', address: 'Marktgasse 3, 3011 Bern, Switzerland', tax_id: 'CHE-987.654.321' },
        invoice_number: 'HP-2026-81',
        issue_date: '2026-06-20',
        due_date: '2026-07-20',
        currency: 'CHF',
        line_items: [
          line('Posters A1', 40, 12, 8.1),
          line('Posters A2', 60, 7.5, 8.1),
          line('Flyers A5, 1000 pcs', 3, 120, 8.1),
          line('Roll-up banner', 2, 189, 8.1),
          line('Name badges', 150, 1.2, 8.1),
          line('Lanyards', 150, 0.9, 8.1),
          line('Event programme booklets', 300, 2.4, 8.1),
          line('Table signs', 25, 4, 8.1),
          line('Stickers sheet', 200, 0.5, 8.1),
          line('Envelopes C5', 500, 0.18, 8.1),
          line('Express delivery', 1, 60, 8.1),
          line('Proofing', 1, 45, 8.1),
        ],
        payment_terms: 'Net 30',
      }),
    ],
  },
  {
    file: 'pdf-scanned.pdf',
    format: 'pdf',
    style: 'scanned-pdf',
    scanned: true,
    invoices: [
      invoice({
        vendor: contoso,
        buyer: initech,
        invoice_number: 'CC-400',
        issue_date: '2026-03-15',
        due_date: '2026-03-29',
        currency: 'EUR',
        line_items: [line('Coffee beans 1kg', 5, 24, 13.5), line('Milk frother', 1, 79, 23)],
        payment_terms: 'Net 14',
      }),
    ],
  },
  {
    file: 'image-invoice.png',
    format: 'png',
    style: 'image',
    invoices: [
      invoice({
        vendor: initech,
        buyer: northwind,
        invoice_number: 'IT-1009',
        issue_date: '2026-02-01',
        due_date: '2026-02-15',
        currency: 'USD',
        line_items: [line('TPS report review (hours)', 12, 85, null)],
        payment_terms: 'Net 14',
      }),
    ],
  },
  {
    file: 'image-invoice.jpg',
    format: 'jpeg',
    style: 'image',
    invoices: [
      invoice({
        vendor: umbrella,
        buyer: helvetia,
        invoice_number: 'UL-5610',
        issue_date: '2026-04-11',
        due_date: '2026-05-11',
        currency: 'EUR',
        line_items: [line('Customs clearance', 1, 180, 20), line('Storage, per day', 4, 22, 20)],
        payment_terms: 'Net 30',
      }),
    ],
  },
  {
    file: 'image-invoice.webp',
    format: 'webp',
    style: 'image',
    invoices: [
      invoice({
        vendor: acme,
        buyer: contoso,
        invoice_number: 'AC-2026-0177',
        issue_date: '2026-05-05',
        due_date: '2026-06-04',
        currency: 'EUR',
        line_items: [line('Point-of-sale app subscription (monthly)', 3, 39, 19)],
        payment_terms: 'Net 30',
      }),
    ],
  },
  {
    file: 'docx-invoice.docx',
    format: 'docx',
    style: 'docx',
    invoices: [
      invoice({
        vendor: { name: 'Studio Lumen', address: 'Calle Mayor 5, 28013 Madrid, Spain', tax_id: 'ESB12345678' },
        buyer: acme,
        invoice_number: 'SL-2026-012',
        issue_date: '2026-03-28',
        due_date: '2026-04-27',
        currency: 'EUR',
        line_items: [line('Product photography, half day', 1, 650, 21), line('Image retouching', 20, 15, 21)],
        payment_terms: 'Net 30',
      }),
    ],
  },
  {
    file: 'docx-two-invoices.docx',
    format: 'docx',
    style: 'docx',
    invoices: [
      invoice({
        vendor: { name: 'Studio Lumen', address: 'Calle Mayor 5, 28013 Madrid, Spain', tax_id: 'ESB12345678' },
        buyer: umbrella,
        invoice_number: 'SL-2026-020',
        issue_date: '2026-04-30',
        due_date: '2026-05-30',
        currency: 'EUR',
        line_items: [line('Video edit, promotional clip', 1, 1200, 21)],
        payment_terms: 'Net 30',
      }),
      invoice({
        vendor: { name: 'Studio Lumen', address: 'Calle Mayor 5, 28013 Madrid, Spain', tax_id: 'ESB12345678' },
        buyer: umbrella,
        invoice_number: 'SL-2026-021',
        issue_date: '2026-05-02',
        due_date: '2026-06-01',
        currency: 'EUR',
        line_items: [line('Voice-over recording', 2, 180, 21)],
        payment_terms: 'Net 30',
      }),
    ],
  },
  {
    file: 'html-invoice.html',
    format: 'html',
    style: 'html-table',
    invoices: [
      invoice({
        vendor: { name: 'CloudNest Hosting Ltd', address: '1 Silicon Way, Manchester M1 1AA, United Kingdom', tax_id: 'GB987654321' },
        buyer: globex,
        invoice_number: 'CN-INV-302144',
        issue_date: '2026-06-01',
        due_date: '2026-06-15',
        currency: 'GBP',
        line_items: [
          line('VPS Pro plan (June)', 2, 24, 20),
          line('Managed backups', 1, 9.5, 20),
          line('Extra IPv4 address', 3, 2, 20),
        ],
        payment_terms: 'Card on file charged automatically on the due date',
      }),
    ],
  },
  {
    file: 'html-email-receipt.html',
    format: 'html',
    style: 'html-email',
    invoices: [
      invoice({
        vendor: { name: 'Bytewise Courses Inc.', address: '77 King St W, Toronto, ON M5K 1A1, Canada', tax_id: '812345678RT0001' },
        buyer: { name: 'Sam Rivera', address: null, tax_id: null },
        invoice_number: 'BW-77120',
        issue_date: '2026-07-08',
        due_date: null,
        currency: 'CAD',
        line_items: [line('TypeScript in Depth, video course', 1, 149, 13)],
        payment_terms: 'Paid by card',
      }),
    ],
  },
]
