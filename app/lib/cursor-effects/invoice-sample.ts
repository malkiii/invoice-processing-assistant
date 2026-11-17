export interface SampleInvoiceLine {
  field: string
  label: string
  value: string
  strong?: boolean
}

/** The sample Invoice shown on the landing page, as a scan and as extracted JSON. */
export const sampleInvoiceLines: readonly SampleInvoiceLine[] = [
  { field: 'vendor_name', label: 'Northwind Paper Co.', value: '"Northwind Paper Co."', strong: true },
  { field: 'vendor_vat_id', label: 'VAT FR 40 303 265 045', value: '"FR40303265045"' },
  { field: 'invoice_number', label: 'Invoice INV-2026-0418', value: '"INV-2026-0418"' },
  { field: 'invoice_date', label: 'Issued 14 Nov 2026', value: '"2026-11-14"' },
  { field: 'line_items[0]', label: 'A4 copy paper ×40   €480.00', value: '{ "qty": 40, "amount": 480.00 }' },
  { field: 'line_items[1]', label: 'Toner cartridges ×6   €553.33', value: '{ "qty": 6, "amount": 553.33 }' },
  { field: 'subtotal', label: 'Subtotal   €1,033.33', value: '1033.33' },
  { field: 'tax_amount', label: 'VAT 20%   €206.67', value: '206.67' },
  { field: 'total_amount', label: 'Total due   €1,240.00', value: '1240.00', strong: true },
]
