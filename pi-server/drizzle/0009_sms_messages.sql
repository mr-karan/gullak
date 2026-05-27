CREATE TABLE `sms_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`sender` text NOT NULL,
	`body` text NOT NULL,
	`received_at` integer NOT NULL,
	`linked_transaction_id` text,
	`base_transaction_updated_at` integer,
	`candidate_json` text,
	`enriched_json` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`enriched_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sms_messages_status_idx` ON `sms_messages` (`status`);--> statement-breakpoint
CREATE INDEX `sms_messages_linked_txn_idx` ON `sms_messages` (`linked_transaction_id`);