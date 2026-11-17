import type { Field } from './fields'

/** Fixed id of the built-in default Template row (seeded on every migration run). */
export const DEFAULT_TEMPLATE_ID = 'builtin-default-invoice'

const party = (who: 'vendor' | 'buyer'): Field => {
  const role =
    who === 'vendor'
      ? 'the seller who issued the invoice and is owed the money'
      : 'the customer the invoice is addressed to, who has to pay it'
  return {
    key: who,
    label: who === 'vendor' ? 'Vendor' : 'Buyer',
    description: `The party that is ${role}.`,
    type: 'object',
    required: false,
    fields: [
      {
        key: 'name',
        label: 'Name',
        description: `Legal or trading name of ${role}, exactly as printed.`,
        type: 'text',
        required: true,
      },
      {
        key: 'address',
        label: 'Address',
        description: 'Full postal address on one line, parts separated by commas. Null if not printed.',
        type: 'text',
        required: false,
      },
      {
        key: 'tax_id',
        label: 'Tax ID',
        description:
          'VAT number, GST/HST number, EIN, SIRET or other tax registration number, as printed including any country prefix. Null if absent.',
        type: 'text',
        required: false,
      },
    ],
  }
}

const amount = (key: string, label: string, description: string, required = false): Field => ({
  key,
  label,
  description: `${description} A plain number in the invoice currency, without currency symbols or thousands separators.`,
  type: 'number',
  required,
})

/** The built-in default Template: the canonical invoice Fields (spec "Templates"). Read-only, cloneable. */
export const DEFAULT_TEMPLATE: { id: string; name: string; fields: Field[] } = {
  id: DEFAULT_TEMPLATE_ID,
  name: 'Invoice (default)',
  fields: [
    party('vendor'),
    party('buyer'),
    {
      key: 'invoice_number',
      label: 'Invoice number',
      description:
        'The identifier the vendor gave this invoice (often labelled Invoice No., Invoice #, Rechnungsnummer, Facture n°). Not an order, customer or reference number.',
      type: 'text',
      required: true,
    },
    {
      key: 'issue_date',
      label: 'Issue date',
      description: 'The date the invoice was issued (invoice date), as YYYY-MM-DD. Not the delivery or due date.',
      type: 'date',
      required: true,
    },
    {
      key: 'due_date',
      label: 'Due date',
      description:
        'The date payment is due, as YYYY-MM-DD. If only payment terms are given (e.g. "Net 30"), leave null rather than computing it.',
      type: 'date',
      required: false,
    },
    {
      key: 'currency',
      label: 'Currency',
      description:
        'ISO 4217 code of the currency the invoice is billed in (e.g. EUR, USD, GBP). Infer it from symbols such as € or £ when no code is printed.',
      type: 'text',
      required: true,
    },
    {
      key: 'line_items',
      label: 'Line items',
      description:
        'Each billed line in the order printed. Exclude subtotal, tax, shipping summary and total rows unless they are billed as their own line.',
      type: 'list',
      required: false,
      fields: [
        {
          key: 'description',
          label: 'Description',
          description: 'What was sold or the service provided, as printed on the line.',
          type: 'text',
          required: true,
        },
        {
          key: 'quantity',
          label: 'Quantity',
          description: 'Number of units on the line. Null if the line has no quantity.',
          type: 'number',
          required: false,
        },
        amount('unit_price', 'Unit price', 'Price per unit before tax.'),
        amount('amount', 'Amount', 'The line total as printed (usually quantity × unit price, before tax).', true),
        {
          key: 'tax_rate',
          label: 'Tax rate',
          description: 'The VAT or sales tax rate for this line as a percentage number (19 for 19%). Null if not shown.',
          type: 'number',
          required: false,
        },
      ],
    },
    amount('subtotal', 'Subtotal', 'Sum of line amounts before tax (net total).'),
    amount('tax_total', 'Tax total', 'Total VAT or sales tax charged. 0 if the invoice states no tax is charged.'),
    amount('total', 'Total', 'The final amount payable including tax (gross total, amount due).', true),
    {
      key: 'payment_terms',
      label: 'Payment terms',
      description: 'Payment terms as printed, e.g. "Net 30", "Due on receipt", or bank transfer instructions summary.',
      type: 'text',
      required: false,
    },
  ],
}
