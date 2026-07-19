ALTER TABLE `payees` ADD `learn_categories` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `rules` ADD `stage` text DEFAULT 'main' NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `reconciled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `imported_id` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `group_parent_id` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `is_group_parent` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_tx_imported` ON `transactions` (`account_id`,`imported_id`);--> statement-breakpoint
CREATE INDEX `idx_tx_group_parent` ON `transactions` (`group_parent_id`);