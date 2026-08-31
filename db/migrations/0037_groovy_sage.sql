CREATE TABLE `ledger_vendor_tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vendor_id` integer NOT NULL,
	`tag` text NOT NULL,
	FOREIGN KEY (`vendor_id`) REFERENCES `ledger_vendors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_vendor_tag` ON `ledger_vendor_tags` (`vendor_id`,`tag`);--> statement-breakpoint
ALTER TABLE `restaurant_settings` ADD `toast_closeout_mode` text DEFAULT 'ASK' NOT NULL;--> statement-breakpoint
ALTER TABLE `restaurant_settings` ADD `platform_closeout_mode` text DEFAULT 'ASK' NOT NULL;--> statement-breakpoint
ALTER TABLE `shift_sales` ADD `toast_takeout_sales` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `shift_sales` ADD `toast_delivery_sales` real DEFAULT 0 NOT NULL;