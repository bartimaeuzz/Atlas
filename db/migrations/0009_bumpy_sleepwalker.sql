CREATE TABLE `supplier_check_payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vendor_id` integer NOT NULL,
	`paid_date` text NOT NULL,
	`check_number` text,
	`total_amount` real NOT NULL,
	`paid_by_employee_id` integer NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`vendor_id`) REFERENCES `ledger_vendors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`paid_by_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `supplier_invoices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`received_date` text NOT NULL,
	`vendor_id` integer NOT NULL,
	`category_id` integer NOT NULL,
	`invoice_number` text NOT NULL,
	`description` text,
	`amount` real NOT NULL,
	`photo_url` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`payment_id` integer,
	`created_by_employee_id` integer NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`vendor_id`) REFERENCES `ledger_vendors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `ledger_categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_id`) REFERENCES `supplier_check_payments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
