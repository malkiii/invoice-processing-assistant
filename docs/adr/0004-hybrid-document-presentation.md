# Present Documents to the model natively when possible, as text otherwise

Because Users pick their own models, an Extraction checks the model's Model Capability: PDFs and images go natively to vision/PDF-capable models; otherwise Documents are converted (DOCX via mammoth, HTML via readability + turndown, PDF rendered or text-extracted). We rejected "always OCR to text first" because it throws away layout that vision models use well, and "always native" because it locks out text-only and local models.
