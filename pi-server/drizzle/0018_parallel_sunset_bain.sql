CREATE TABLE `category_targets` (
	`category_id` text PRIMARY KEY NOT NULL,
	`type` text DEFAULT 'monthly' NOT NULL,
	`amount_cents` integer NOT NULL,
	`by_date` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
