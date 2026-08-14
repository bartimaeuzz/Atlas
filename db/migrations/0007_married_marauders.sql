CREATE TABLE `schedule_change_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`week_id` integer NOT NULL,
	`week_start_date` text NOT NULL,
	`action` text NOT NULL,
	`date` text,
	`was_published` integer NOT NULL,
	`reason` text,
	`performed_by_employee_id` integer NOT NULL,
	`performed_by_name` text NOT NULL,
	`removed_assignments` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`performed_by_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
