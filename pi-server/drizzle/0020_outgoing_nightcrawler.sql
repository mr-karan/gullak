CREATE TABLE `sync_legacy_clients` (
	`client_id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`migrated_actor_id` text,
	`first_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_push_at` integer,
	`last_pull_cursor` integer DEFAULT 0 NOT NULL,
	`drained_v1_head` integer,
	`drained_at` integer,
	`retired_at` integer,
	CONSTRAINT "sync_legacy_clients_nonnegative_pull_cursor" CHECK("sync_legacy_clients"."last_pull_cursor" >= 0)
);
--> statement-breakpoint
CREATE INDEX `idx_sync_legacy_clients_status` ON `sync_legacy_clients` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_sync_legacy_clients_migrated_actor` ON `sync_legacy_clients` (`migrated_actor_id`);--> statement-breakpoint
CREATE TABLE `sync_legacy_relation_ids` (
	`legacy_id` text PRIMARY KEY NOT NULL,
	`canonical_id` text NOT NULL,
	`transaction_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`first_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sync_legacy_relation_canonical` ON `sync_legacy_relation_ids` (`canonical_id`);--> statement-breakpoint
ALTER TABLE `sync_epochs` ADD `legacy_inventory_sealed_at` integer;