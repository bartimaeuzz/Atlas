CREATE TABLE `swap_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`assignment_id` integer NOT NULL,
	`requesting_employee_id` integer NOT NULL,
	`accepting_employee_id` integer,
	`status` text DEFAULT 'open' NOT NULL,
	`note` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`responded_at` text,
	`decided_at` text,
	`decided_by_employee_id` integer,
	FOREIGN KEY (`assignment_id`) REFERENCES `planned_shift_assignments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requesting_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`accepting_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`decided_by_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
