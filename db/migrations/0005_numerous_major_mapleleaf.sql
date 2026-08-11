CREATE TABLE `employee_schedule_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`position_id` integer NOT NULL,
	`day_of_week` integer NOT NULL,
	`period` text NOT NULL,
	`effective_from` text,
	`vacancy_reason` text,
	`vacancy_starts_on` text,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`position_id`) REFERENCES `positions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_template_employee_position_day_period` ON `employee_schedule_templates` (`employee_id`,`position_id`,`day_of_week`,`period`);--> statement-breakpoint
CREATE TABLE `position_staffing_targets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`position_id` integer NOT NULL,
	`day_of_week` integer NOT NULL,
	`period` text NOT NULL,
	`target_count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`position_id`) REFERENCES `positions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_staffing_target_position_day_period` ON `position_staffing_targets` (`position_id`,`day_of_week`,`period`);