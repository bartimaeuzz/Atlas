CREATE TABLE `supplier_check_audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invoice_id` integer,
	`payment_id` integer,
	`vendor_id` integer NOT NULL,
	`action` text NOT NULL,
	`performed_by_employee_id` integer NOT NULL,
	`performed_by_name` text NOT NULL,
	`reason` text,
	`details` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `supplier_invoices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_id`) REFERENCES `supplier_check_payments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vendor_id`) REFERENCES `ledger_vendors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`performed_by_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
