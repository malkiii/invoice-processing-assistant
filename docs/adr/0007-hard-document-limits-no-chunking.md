# Documents over the size/page limit are rejected, never chunked

Every Document must fit within instance-configured limits (default 25 MB, 30 pages) and is extracted in a single model call; larger Documents fail with a clear message. Page-chunking and two-pass page-range detection were considered and deliberately rejected, not deferred: chunking breaks Invoices that span boundaries, and both multiply cost on the User's own provider bill. Users split large files themselves.
