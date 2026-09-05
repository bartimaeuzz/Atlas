CREATE TABLE `supplier_invoice_photos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invoice_id` integer NOT NULL,
	`url` text NOT NULL,
	`pathname` text NOT NULL,
	`uploaded_by_employee_id` integer NOT NULL,
	`uploaded_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `supplier_invoices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `supplier_invoice_photos_invoice_idx` ON `supplier_invoice_photos` (`invoice_id`);