ALTER TABLE `restaurant_settings` ADD `recovery_code_hash` text;--> statement-breakpoint
ALTER TABLE `restaurant_settings` ADD `recovery_code_set_at` text;--> statement-breakpoint
ALTER TABLE `restaurant_settings` ADD `recovery_failed_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `restaurant_settings` ADD `recovery_locked_until` text;--> statement-breakpoint
ALTER TABLE `restaurant_settings` ADD `recovery_code_last_used_at` text;--> statement-breakpoint
ALTER TABLE `restaurant_settings` ADD `recovery_code_last_used_for_employee_id` integer REFERENCES employees(id);