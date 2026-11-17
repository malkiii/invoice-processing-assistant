# Extractions snapshot their Template instead of Templates being versioned

Each Extraction stores a full copy of the Template it ran with (a Template Snapshot), and Templates themselves are freely editable with no version history. This keeps old Invoices rendering correctly after Fields are renamed or removed, without the machinery of version tables; we rejected locking used Templates as too hostile to iteration.
