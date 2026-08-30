ALTER TABLE `shift_roster_entries` ADD `point_decided_at` text;--> statement-breakpoint
ALTER TABLE `shift_roster_entries` ADD `point_decided_by_employee_id` integer REFERENCES employees(id);