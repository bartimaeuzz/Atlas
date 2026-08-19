CREATE TABLE `employee_capabilities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`capability_key` text NOT NULL,
	`granted` integer DEFAULT false NOT NULL,
	`expires_at` text,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_employee_capability` ON `employee_capabilities` (`employee_id`,`capability_key`);--> statement-breakpoint
CREATE TABLE `permission_grant_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`capability_key` text NOT NULL,
	`action` text NOT NULL,
	`expires_at` text,
	`acting_employee_id` integer NOT NULL,
	`note` text,
	`occurred_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`acting_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
