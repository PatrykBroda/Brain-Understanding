CREATE TABLE "account_deletion_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"file_path" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "account_deletion_files_path_uq" ON "account_deletion_files" USING btree ("file_path");