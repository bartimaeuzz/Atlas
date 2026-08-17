ALTER TABLE `employees` ADD `is_partner` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `employees` ADD `login_id` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `login_sequence` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `employees_login_id_unique` ON `employees` (`login_id`);--> statement-breakpoint
ALTER TABLE `restaurant_settings` ADD `staff_login_method` text DEFAULT 'NAME' NOT NULL;