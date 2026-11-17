-- Announces Document inserts and status changes on the `document_status` channel
-- (server/domain/document-events.ts), whichever process makes them.
CREATE OR REPLACE FUNCTION notify_document_status() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM pg_notify('document_status', json_build_object(
      'documentId', NEW.id,
      'batchId', NEW.batch_id,
      'userId', NEW.user_id,
      'status', NEW.status,
      'failureReason', left(NEW.failure_reason, 1000)
    )::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER document_status_notify
  AFTER INSERT OR UPDATE OF status ON "document"
  FOR EACH ROW EXECUTE FUNCTION notify_document_status();
