CREATE TABLE `shift_attendance_marks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shift_id` integer NOT NULL,
	`employee_id` integer NOT NULL,
	`mark` text NOT NULL,
	`note` text,
	`marked_by_employee_id` integer,
	`marked_at` text NOT NULL,
	FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`marked_by_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_attendance_shift_employee` ON `shift_attendance_marks` (`shift_id`,`employee_id`);--> statement-breakpoint
ALTER TABLE `shift_roster_entries` ADD `coverage_kind` text;--> statement-breakpoint
ALTER TABLE `shift_roster_entries` ADD `coverage_note` text;--> statement-breakpoint
ALTER TABLE `shift_roster_entries` ADD `covers_employee_id` integer REFERENCES employees(id);