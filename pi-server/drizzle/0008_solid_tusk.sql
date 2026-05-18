CREATE TABLE `whatsapp_inbox_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`source_user` text,
	`push_name` text,
	`chat_id` text,
	`message_id` text,
	`item_index` integer DEFAULT 0 NOT NULL,
	`body` text NOT NULL,
	`received_at` integer NOT NULL,
	`candidate_json` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`delivered_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
