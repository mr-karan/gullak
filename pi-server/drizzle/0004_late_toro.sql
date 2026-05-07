CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` integer,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tag_name` ON `tags` (`name`);--> statement-breakpoint
CREATE TABLE `transaction_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_transaction_tag_pair` ON `transaction_tags` (`transaction_id`,`tag_id`);--> statement-breakpoint
ALTER TABLE `transactions` ADD `latitude` real;--> statement-breakpoint
ALTER TABLE `transactions` ADD `longitude` real;--> statement-breakpoint
ALTER TABLE `transactions` ADD `location_name` text;