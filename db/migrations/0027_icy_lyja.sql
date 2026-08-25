ALTER TABLE `leave_requests` ADD `status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `leave_requests` ADD `decided_by_employee_id` integer REFERENCES employees(id);--> statement-breakpoint
ALTER TABLE `leave_requests` ADD `decided_at` text;--> statement-breakpoint
UPDATE `leave_requests` SET `status` = 'approved';