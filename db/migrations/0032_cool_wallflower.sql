ALTER TABLE `shifts` ADD `created_by_employee_id` integer REFERENCES employees(id);--> statement-breakpoint
ALTER TABLE `shifts` ADD `created_at` text;--> statement-breakpoint
ALTER TABLE `shifts` ADD `finalized_by_employee_id` integer REFERENCES employees(id);