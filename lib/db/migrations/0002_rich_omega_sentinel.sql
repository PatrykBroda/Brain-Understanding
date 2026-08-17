CREATE TABLE "hero_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"fighter_id" integer NOT NULL,
	"mime_type" text NOT NULL,
	"data_base64" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hero_images" ADD CONSTRAINT "hero_images_fighter_id_fighters_id_fk" FOREIGN KEY ("fighter_id") REFERENCES "public"."fighters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hero_images_fighter_uq" ON "hero_images" USING btree ("fighter_id");