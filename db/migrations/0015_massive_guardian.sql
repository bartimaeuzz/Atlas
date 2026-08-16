CREATE TABLE `notification_seen` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`section` text NOT NULL,
	`last_seen_at` text NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_seen_employee_section_idx` ON `notification_seen` (`employee_id`,`section`);