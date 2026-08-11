CREATE TABLE `planned_shift_assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`week_id` integer NOT NULL,
	`employee_id` integer NOT NULL,
	`position_id` integer NOT NULL,
	`date` text NOT NULL,
	`period` text NOT NULL,
	`source_type` text DEFAULT 'MANUAL_ADD' NOT NULL,
	`is_extra_coverage` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`week_id`) REFERENCES `schedule_weeks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`position_id`) REFERENCES `positions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_planned_assignment_week_employee_position_date_period` ON `planned_shift_assignments` (`week_id`,`employee_id`,`position_id`,`date`,`period`);--> statement-breakpoint
CREATE TABLE `schedule_weeks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`week_start_date` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `schedule_weeks_week_start_date_unique` ON `schedule_weeks` (`week_start_date`);