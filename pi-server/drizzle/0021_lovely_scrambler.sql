DROP TABLE `change_log`;--> statement-breakpoint
DROP TABLE `sync_legacy_clients`;--> statement-breakpoint
DROP TABLE `sync_legacy_relation_ids`;--> statement-breakpoint
ALTER TABLE `sync_epochs` DROP COLUMN `legacy_inventory_sealed_at`;