CREATE INDEX `idx_tx_date` ON `transactions` (`date`);--> statement-breakpoint
CREATE INDEX `idx_tx_account_date` ON `transactions` (`account_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_tx_category` ON `transactions` (`category_id`);