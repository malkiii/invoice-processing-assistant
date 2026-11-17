CREATE TABLE "provider_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"encrypted_api_key" text,
	"api_key_hint" text,
	"base_url" text,
	"default_model" text,
	"status" text DEFAULT 'ok' NOT NULL,
	"status_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_connection_status" CHECK ("provider_connection"."status" in ('ok', 'broken'))
);
--> statement-breakpoint
CREATE TABLE "provider_model_setting" (
	"connection_id" text NOT NULL,
	"model_id" text NOT NULL,
	"capability_override" text,
	"input_price_per_million" double precision,
	"output_price_per_million" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_model_setting_connection_id_model_id_pk" PRIMARY KEY("connection_id","model_id"),
	CONSTRAINT "provider_model_setting_capability" CHECK ("provider_model_setting"."capability_override" is null or "provider_model_setting"."capability_override" in ('pdf', 'images', 'text')),
	CONSTRAINT "provider_model_setting_prices_non_negative" CHECK (coalesce("provider_model_setting"."input_price_per_million", 0) >= 0 and coalesce("provider_model_setting"."output_price_per_million", 0) >= 0)
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"default_connection_id" text,
	"default_model" text,
	"default_template_id" text,
	"theme" text DEFAULT 'noir' NOT NULL,
	"auto_delete_after_days" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_theme" CHECK ("user_preferences"."theme" in ('noir', 'day')),
	CONSTRAINT "user_preferences_auto_delete_positive" CHECK ("user_preferences"."auto_delete_after_days" is null or "user_preferences"."auto_delete_after_days" > 0)
);
--> statement-breakpoint
ALTER TABLE "provider_connection" ADD CONSTRAINT "provider_connection_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_model_setting" ADD CONSTRAINT "provider_model_setting_connection_id_provider_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."provider_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_default_connection_id_provider_connection_id_fk" FOREIGN KEY ("default_connection_id") REFERENCES "public"."provider_connection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "provider_connection_user_id_idx" ON "provider_connection" USING btree ("user_id");