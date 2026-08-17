ALTER TABLE `employees` RENAME COLUMN `name` TO `nickname`;--> statement-breakpoint
ALTER TABLE `employees` ADD `legal_first_name` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `legal_last_name` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `date_of_birth` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `mobile_phone` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `address_line1` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `address_line2` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `city` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `state` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `zip_code` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `ssn_or_itin` text;
