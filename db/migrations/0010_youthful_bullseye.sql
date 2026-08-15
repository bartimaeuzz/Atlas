ALTER TABLE `supplier_check_payments` ADD `status` text DEFAULT 'printed' NOT NULL;--> statement-breakpoint
ALTER TABLE `supplier_check_payments` ADD `delivered_at` text;--> statement-breakpoint
ALTER TABLE `supplier_check_payments` ADD `delivered_by_employee_id` integer REFERENCES employees(id);