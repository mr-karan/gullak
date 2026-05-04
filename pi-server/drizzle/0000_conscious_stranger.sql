CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'checking' NOT NULL,
	`opening_balance_cents` integer DEFAULT 0 NOT NULL,
	`on_budget` integer DEFAULT true NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_kv` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text
);
--> statement-breakpoint
CREATE TABLE `budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text NOT NULL,
	`month` text NOT NULL,
	`target_cents` integer NOT NULL,
	`rollover_cents` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`group_id` text NOT NULL,
	`color` integer,
	`icon` text,
	`hidden` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `category_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`is_income` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `change_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`client_id` text,
	`resource` text NOT NULL,
	`resource_id` text NOT NULL,
	`op` text NOT NULL,
	`payload` text
);
--> statement-breakpoint
CREATE TABLE `payees` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`use_count` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recurrences` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`category_id` text,
	`payee_id` text,
	`payee_name` text,
	`amount_cents` integer NOT NULL,
	`notes` text,
	`cadence` text NOT NULL,
	`next_date` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`category_id` text,
	`payee_id` text,
	`payee_name` text,
	`amount_cents` integer NOT NULL,
	`date` text NOT NULL,
	`notes` text,
	`cleared` integer DEFAULT false NOT NULL,
	`origin` text DEFAULT 'manual' NOT NULL,
	`origin_ref` text,
	`transfer_account_id` text,
	`transfer_group_id` text,
	`parent_id` text,
	`split_total_cents` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
