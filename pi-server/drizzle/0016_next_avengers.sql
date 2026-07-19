CREATE TABLE `desire_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`desire_id` text NOT NULL,
	`person` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_desire_comment_desire` ON `desire_comments` (`desire_id`);--> statement-breakpoint
CREATE TABLE `desire_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`desire_id` text NOT NULL,
	`path` text NOT NULL,
	`content_type` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_desire_photo_desire` ON `desire_photos` (`desire_id`);--> statement-breakpoint
CREATE TABLE `desires` (
	`id` text PRIMARY KEY NOT NULL,
	`person` text NOT NULL,
	`title` text NOT NULL,
	`est_cost_cents` integer NOT NULL,
	`why` text,
	`status` text DEFAULT 'dreaming' NOT NULL,
	`decided_at` integer,
	`bought_transaction_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_desire_person` ON `desires` (`person`);--> statement-breakpoint
CREATE INDEX `idx_desire_status` ON `desires` (`status`);--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`emoji` text,
	`target_cents` integer NOT NULL,
	`target_date` text,
	`notes` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `holdings` (
	`id` text PRIMARY KEY NOT NULL,
	`isin` text NOT NULL,
	`symbol` text NOT NULL,
	`name` text,
	`kind` text NOT NULL,
	`sector` text,
	`quantity` real NOT NULL,
	`avg_price` real NOT NULL,
	`last_price` real NOT NULL,
	`invested_cents` integer NOT NULL,
	`current_cents` integer NOT NULL,
	`goal_id` text,
	`stale` integer DEFAULT false NOT NULL,
	`imported_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_holding_isin` ON `holdings` (`isin`);--> statement-breakpoint
CREATE INDEX `idx_holding_goal` ON `holdings` (`goal_id`);