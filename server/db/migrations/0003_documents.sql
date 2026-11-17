CREATE TABLE "batch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"batch_id" uuid NOT NULL,
	"source" text NOT NULL,
	"name" text NOT NULL,
	"storage_key" text,
	"size_bytes" bigint,
	"format" text,
	"mime_type" text,
	"page_count" integer,
	"status" text NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_status" CHECK ("document"."status" in ('uploading', 'queued', 'processing', 'extracted', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "batch" ADD CONSTRAINT "batch_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_batch_id_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "batch_user_id_created_at_idx" ON "batch" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "document_user_id_created_at_idx" ON "document" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "document_batch_id_idx" ON "document" USING btree ("batch_id");