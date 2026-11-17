CREATE TABLE "export" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"format" text NOT NULL,
	"csv_layout" text,
	"scope" jsonb NOT NULL,
	"reviewed_only" boolean DEFAULT false NOT NULL,
	"status" text NOT NULL,
	"invoice_count" integer NOT NULL,
	"file_name" text,
	"storage_key" text,
	"content_type" text,
	"size_bytes" bigint,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "export_status" CHECK ("export"."status" in ('pending', 'ready', 'failed')),
	CONSTRAINT "export_format" CHECK ("export"."format" in ('csv', 'xlsx', 'json'))
);
--> statement-breakpoint
ALTER TABLE "export" ADD CONSTRAINT "export_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "export_user_id_created_at_idx" ON "export" USING btree ("user_id","created_at");