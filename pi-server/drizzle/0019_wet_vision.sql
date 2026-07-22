CREATE TABLE `sync_changes` (
	`transport_cursor` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`change_id` text NOT NULL,
	`epoch` text NOT NULL,
	`actor_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`lamport` integer NOT NULL,
	`wall_time_ms` integer NOT NULL,
	`schema_version` integer NOT NULL,
	`context_json` text NOT NULL,
	`ops_json` text NOT NULL,
	`envelope_json` text NOT NULL,
	`content_hash` text NOT NULL,
	`source` text NOT NULL,
	`accepted_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "sync_changes_positive_sequence" CHECK("sync_changes"."sequence" > 0),
	CONSTRAINT "sync_changes_positive_lamport" CHECK("sync_changes"."lamport" > 0),
	CONSTRAINT "sync_changes_positive_schema" CHECK("sync_changes"."schema_version" > 0),
	CONSTRAINT "sync_changes_valid_context_json" CHECK(json_valid("sync_changes"."context_json")),
	CONSTRAINT "sync_changes_valid_ops_json" CHECK(json_valid("sync_changes"."ops_json")),
	CONSTRAINT "sync_changes_valid_envelope_json" CHECK(json_valid("sync_changes"."envelope_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_sync_change_id` ON `sync_changes` (`change_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_sync_actor_sequence` ON `sync_changes` (`actor_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `idx_sync_changes_epoch_cursor` ON `sync_changes` (`epoch`,`transport_cursor`);--> statement-breakpoint
CREATE INDEX `idx_sync_changes_accepted_at` ON `sync_changes` (`accepted_at`);--> statement-breakpoint
CREATE TABLE `sync_checkpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`epoch` text NOT NULL,
	`schema_version` integer NOT NULL,
	`frontier_json` text NOT NULL,
	`registers_json` text NOT NULL,
	`projection_hash` text NOT NULL,
	`content_hash` text NOT NULL,
	`creation_cursor` integer NOT NULL,
	`event_count` integer NOT NULL,
	`is_genesis` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`verified_at` integer,
	CONSTRAINT "sync_checkpoints_positive_schema" CHECK("sync_checkpoints"."schema_version" > 0),
	CONSTRAINT "sync_checkpoints_nonnegative_cursor" CHECK("sync_checkpoints"."creation_cursor" >= 0),
	CONSTRAINT "sync_checkpoints_nonnegative_event_count" CHECK("sync_checkpoints"."event_count" >= 0),
	CONSTRAINT "sync_checkpoints_valid_frontier_json" CHECK(json_valid("sync_checkpoints"."frontier_json")),
	CONSTRAINT "sync_checkpoints_valid_registers_json" CHECK(json_valid("sync_checkpoints"."registers_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_sync_checkpoint_epoch_cursor` ON `sync_checkpoints` (`epoch`,`creation_cursor`);--> statement-breakpoint
CREATE INDEX `idx_sync_checkpoints_epoch_created` ON `sync_checkpoints` (`epoch`,`created_at`);--> statement-breakpoint
CREATE TABLE `sync_clients` (
	`actor_id` text PRIMARY KEY NOT NULL,
	`actor_token_hash` text NOT NULL,
	`protocol_version` integer NOT NULL,
	`epoch` text,
	`status` text DEFAULT 'active' NOT NULL,
	`app_version` text,
	`platform` text,
	`acknowledged_cursor` integer DEFAULT 0 NOT NULL,
	`acknowledged_frontier_json` text DEFAULT '{}' NOT NULL,
	`bootstrap_checkpoint_id` text,
	`last_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`activated_at` integer,
	`retired_at` integer,
	CONSTRAINT "sync_clients_positive_protocol" CHECK("sync_clients"."protocol_version" > 0),
	CONSTRAINT "sync_clients_valid_actor_token_hash" CHECK(length("sync_clients"."actor_token_hash") = 64),
	CONSTRAINT "sync_clients_nonnegative_cursor" CHECK("sync_clients"."acknowledged_cursor" >= 0),
	CONSTRAINT "sync_clients_valid_frontier_json" CHECK(json_valid("sync_clients"."acknowledged_frontier_json"))
);
--> statement-breakpoint
CREATE INDEX `idx_sync_clients_epoch_status` ON `sync_clients` (`epoch`,`status`);--> statement-breakpoint
CREATE INDEX `idx_sync_clients_last_seen` ON `sync_clients` (`last_seen_at`);--> statement-breakpoint
CREATE TABLE `sync_epochs` (
	`id` text PRIMARY KEY NOT NULL,
	`protocol` integer DEFAULT 2 NOT NULL,
	`schema_version` integer NOT NULL,
	`status` text DEFAULT 'preparing' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`activated_at` integer,
	`retired_at` integer,
	CONSTRAINT "sync_epochs_protocol_v2" CHECK("sync_epochs"."protocol" = 2),
	CONSTRAINT "sync_epochs_positive_schema" CHECK("sync_epochs"."schema_version" > 0)
);
--> statement-breakpoint
CREATE INDEX `idx_sync_epochs_status` ON `sync_epochs` (`status`);--> statement-breakpoint
CREATE TABLE `sync_frontiers` (
	`epoch` text NOT NULL,
	`actor_id` text NOT NULL,
	`contiguous_sequence` integer DEFAULT 0 NOT NULL,
	`integrated_cursor` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`epoch`, `actor_id`),
	CONSTRAINT "sync_frontiers_nonnegative_sequence" CHECK("sync_frontiers"."contiguous_sequence" >= 0),
	CONSTRAINT "sync_frontiers_nonnegative_cursor" CHECK("sync_frontiers"."integrated_cursor" >= 0)
);
--> statement-breakpoint
CREATE TABLE `sync_local_clocks` (
	`epoch` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`next_sequence` integer DEFAULT 1 NOT NULL,
	`lamport` integer DEFAULT 0 NOT NULL,
	`integrated_cursor` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "sync_local_clocks_positive_next_sequence" CHECK("sync_local_clocks"."next_sequence" > 0),
	CONSTRAINT "sync_local_clocks_nonnegative_lamport" CHECK("sync_local_clocks"."lamport" >= 0),
	CONSTRAINT "sync_local_clocks_nonnegative_cursor" CHECK("sync_local_clocks"."integrated_cursor" >= 0)
);
--> statement-breakpoint
CREATE TABLE `sync_quarantine` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`epoch` text,
	`change_id` text,
	`actor_id` text,
	`sequence` integer,
	`source` text NOT NULL,
	`reason_code` text NOT NULL,
	`reason` text NOT NULL,
	`content_hash` text,
	`envelope_json` text,
	`original_bytes` blob,
	`received_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`resolved_at` integer,
	`resolution` text
);
--> statement-breakpoint
CREATE INDEX `idx_sync_quarantine_unresolved` ON `sync_quarantine` (`resolved_at`,`received_at`);--> statement-breakpoint
CREATE INDEX `idx_sync_quarantine_change` ON `sync_quarantine` (`change_id`);--> statement-breakpoint
CREATE INDEX `idx_sync_quarantine_actor_sequence` ON `sync_quarantine` (`actor_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `sync_registers` (
	`epoch` text NOT NULL,
	`resource` text NOT NULL,
	`entity_id` text NOT NULL,
	`field` text NOT NULL,
	`policy` text NOT NULL,
	`candidates_json` text NOT NULL,
	`visible_value_json` text,
	`updated_cursor` integer NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`epoch`, `resource`, `entity_id`, `field`),
	CONSTRAINT "sync_registers_valid_candidates_json" CHECK(json_valid("sync_registers"."candidates_json")),
	CONSTRAINT "sync_registers_valid_visible_value_json" CHECK("sync_registers"."visible_value_json" IS NULL OR json_valid("sync_registers"."visible_value_json"))
);
--> statement-breakpoint
CREATE INDEX `idx_sync_registers_entity` ON `sync_registers` (`epoch`,`resource`,`entity_id`);--> statement-breakpoint
CREATE INDEX `idx_sync_registers_cursor` ON `sync_registers` (`epoch`,`updated_cursor`);
