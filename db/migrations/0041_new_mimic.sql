ALTER TABLE `employees` ADD `login_failed_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `employees` ADD `login_locked_until` text;