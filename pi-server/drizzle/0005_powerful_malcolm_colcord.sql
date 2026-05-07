CREATE TABLE `rule_matches` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`transaction_id` text,
	`matched_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`outcome` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`priority` integer DEFAULT 100 NOT NULL,
	`trigger_type` text NOT NULL,
	`trigger_payload` text NOT NULL,
	`action_payload` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
