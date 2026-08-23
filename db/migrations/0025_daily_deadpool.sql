CREATE TABLE `activity_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` text DEFAULT (current_timestamp) NOT NULL,
	`actor_employee_id` integer NOT NULL,
	`type` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`summary` text NOT NULL,
	`detail` text,
	FOREIGN KEY (`actor_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `activity_log_at_idx` ON `activity_log` (`at`);--> statement-breakpoint
CREATE INDEX `activity_log_type_idx` ON `activity_log` (`type`);--> statement-breakpoint
CREATE INDEX `activity_log_entity_idx` ON `activity_log` (`entity_type`,`entity_id`);--> statement-breakpoint
ALTER TABLE `daily_cash_reconciliations` ADD `other_cash_reason` text;