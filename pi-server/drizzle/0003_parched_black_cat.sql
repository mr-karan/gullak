CREATE TABLE `feedback_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`message` text,
	`payload` text NOT NULL,
	`client_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
