CREATE TABLE `export_state` (
	`destination` text PRIMARY KEY NOT NULL,
	`cursor` integer DEFAULT 0 NOT NULL,
	`last_attempt_at` integer,
	`last_success_at` integer,
	`last_error` text,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
-- Seed the "sheets" destination from the old single-row state so the existing
-- Sheets export keeps its high-water cursor (no full re-push on first run).
INSERT OR IGNORE INTO `export_state`
	(`destination`, `cursor`, `last_attempt_at`, `last_success_at`, `last_error`, `consecutive_failures`, `updated_at`)
SELECT 'sheets', `cursor`, `last_attempt_at`, `last_success_at`, `last_error`, `consecutive_failures`, `updated_at`
FROM `sheets_sync_state` WHERE `id` = 1;
