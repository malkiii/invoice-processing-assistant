# Corrections stay with their Extraction; re-running does not carry them over

Re-running a Document creates a new Extraction with its own Invoices and makes it the Current Extraction. Corrected Values remain attached to the earlier Extraction's Invoices as history and are not migrated, because a new run can find a different number of Invoices and any automatic matching would silently misapply edits. The UI warns before re-running a Document that has corrections. Matching by invoice number may be added later as an explicit, opt-in action.
