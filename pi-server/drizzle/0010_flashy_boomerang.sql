CREATE TABLE `sheets_sync_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`cursor` integer DEFAULT 0 NOT NULL,
	`last_attempt_at` integer,
	`last_success_at` integer,
	`last_error` text,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
