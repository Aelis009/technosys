ALTER TABLE "addresses" ALTER COLUMN "house_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "addresses" ALTER COLUMN "street" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "addresses" ALTER COLUMN "area" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "addresses" ADD COLUMN "address_line" varchar(550);--> statement-breakpoint
UPDATE "addresses"
SET "address_line" = concat_ws(', ', nullif(btrim("house_number"), ''), nullif(btrim("street"), ''), nullif(btrim("area"), ''));--> statement-breakpoint
ALTER TABLE "addresses" ALTER COLUMN "address_line" SET NOT NULL;
