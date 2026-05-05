CREATE TABLE `agent_turns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`thread_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`transaction_id` text,
	`at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
