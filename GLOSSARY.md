# Invoice Processing Assistant

Turns invoice files from many sources into structured, reviewable data, using LLM providers the user brings themselves.

## Language

### Intake

**Document**:
One file a User added, in any supported format (PDF, DOCX, image, HTML), from any source.
_Avoid_: File, upload, attachment

**Batch**:
The set of Documents added together in one intake action (a folder upload, a multi-file drop, a Drive pull).
_Avoid_: Job, import, bundle

**Source**:
Where a Document came from: local upload, URL, Google Drive, or Dropbox.
_Avoid_: Origin, channel

**Source Connection**:
A User's authorised link to an external file store (Google Drive, Dropbox) used to pull Documents. Distinct from the accounts a User signs in with.
_Avoid_: Integration, linked account

### Extraction

**Invoice**:
One logical invoice found inside a Document by a specific Extraction. An Invoice never spans Documents, and belongs to exactly one Extraction.
_Avoid_: Bill, receipt, record

**Template**:
The set of fields to extract from a Document. A built-in default Template exists; Users clone and edit their own.
_Avoid_: Schema, profile, preset

**Field**:
One named value a Template asks for, with a description that tells the model how to find it. A Field is a scalar, a group of Fields, or a repeating list of Fields (such as line items).
_Avoid_: Column, property, attribute

**Template Snapshot**:
The frozen copy of a Template taken when an Extraction runs. Invoices always render against their Extraction's Template Snapshot, never the Template as later edited.
_Avoid_: Template version, schema copy

**Extraction**:
One run of an LLM over a Document using a Template, producing raw structured data for its Invoices. Re-running creates a new Extraction.
_Avoid_: Parse, scan, job, result

**Current Extraction**:
The one Extraction of a Document whose Invoices are shown, reviewed and exported. Earlier Extractions, and any Corrected Values on their Invoices, remain as history.
_Avoid_: Latest result, active run

**Raw Values**:
The field values exactly as an Extraction produced them. Never edited.
_Avoid_: Output, prediction

**Corrected Values**:
A User's edits on top of an Invoice's Raw Values. What the User sees and exports is Raw Values overlaid with Corrected Values.
_Avoid_: Overrides, fixes, final values

**Check**:
A deterministic rule run against an Invoice's values (totals add up, dates valid, possible duplicate). A failed Check flags the Invoice; it never changes values.
_Avoid_: Validation, rule, lint

**Review**:
The act of a User checking an Invoice against its Document, recording Corrected Values, and marking it Reviewed.
_Avoid_: Validation, approval

**Reviewed**:
An Invoice a User has explicitly confirmed. Every Invoice starts unreviewed, whether or not its Checks pass.
_Avoid_: Approved, verified, done

**Export**:
A downloadable rendering (CSV, XLSX, JSON) of one or more Invoices' values.
_Avoid_: Download, report

### Providers

**Provider Connection**:
A User's saved credentials and default model for one LLM provider. A User may hold several.
_Avoid_: API key, LLM config, integration

**Model Capability**:
What a given model can accept as input (native PDF, images, text only), which decides how a Document is presented to it.
_Avoid_: Model features, modality

### People

**User**:
A person with an account. Every Document, Template, Provider Connection and Source Connection belongs to exactly one User.
_Avoid_: Account, customer, member, tenant

**Admin**:
The User who administers the instance: the first to sign up. Sets the sign-up policy (open or invite-only) but cannot see other Users' Documents.
_Avoid_: Owner, superuser, root
