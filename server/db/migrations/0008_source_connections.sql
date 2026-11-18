CREATE TABLE "source_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"account_label" text NOT NULL,
	"encrypted_access_token" text NOT NULL,
	"encrypted_refresh_token" text,
	"access_token_expires_at" timestamp with time zone,
	"status" text DEFAULT 'ok' NOT NULL,
	"status_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_connection_user_kind" UNIQUE("user_id","kind"),
	CONSTRAINT "source_connection_kind" CHECK ("source_connection"."kind" in ('google-drive', 'dropbox')),
	CONSTRAINT "source_connection_status" CHECK ("source_connection"."status" in ('ok', 'broken'))
);
--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "source_ref" text;--> statement-breakpoint
ALTER TABLE "source_connection" ADD CONSTRAINT "source_connection_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;