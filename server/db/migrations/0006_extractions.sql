CREATE TABLE "template" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"fields" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extraction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"connection_id" text,
	"provider_kind" text NOT NULL,
	"model_id" text NOT NULL,
	"template_id" text,
	"template_snapshot" jsonb NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"estimated_cost" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"extraction_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"position" integer NOT NULL,
	"raw_values" jsonb NOT NULL,
	"corrected_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"check_results" jsonb,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "instance_settings" ALTER COLUMN "max_concurrent_documents_per_user" SET DEFAULT 3;--> statement-breakpoint
ALTER TABLE "template" ADD CONSTRAINT "template_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction" ADD CONSTRAINT "extraction_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction" ADD CONSTRAINT "extraction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction" ADD CONSTRAINT "extraction_connection_id_provider_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."provider_connection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction" ADD CONSTRAINT "extraction_template_id_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."template"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_extraction_id_extraction_id_fk" FOREIGN KEY ("extraction_id") REFERENCES "public"."extraction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "template_user_id_idx" ON "template" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "extraction_document_id_idx" ON "extraction" USING btree ("document_id","created_at");--> statement-breakpoint
CREATE INDEX "extraction_user_id_idx" ON "extraction" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "extraction_one_current_per_document" ON "extraction" USING btree ("document_id") WHERE "extraction"."is_current";--> statement-breakpoint
CREATE INDEX "invoice_extraction_id_idx" ON "invoice" USING btree ("extraction_id","position");--> statement-breakpoint
CREATE INDEX "invoice_user_id_idx" ON "invoice" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "invoice_document_id_idx" ON "invoice" USING btree ("document_id");--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_default_template_id_template_id_fk" FOREIGN KEY ("default_template_id") REFERENCES "public"."template"("id") ON DELETE set null ON UPDATE no action;