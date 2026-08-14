CREATE TABLE `daily_cash_reconciliations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`beginning_balance` real DEFAULT 0 NOT NULL,
	`other_cash` real DEFAULT 0 NOT NULL,
	`counted_amount` real,
	`note` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`finalized_at` text,
	`finalized_by_employee_id` integer,
	FOREIGN KEY (`finalized_by_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_cash_reconciliations_date_unique` ON `daily_cash_reconciliations` (`date`);--> statement-breakpoint
CREATE TABLE `ledger_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ledger_vendors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`payee_address_line_1` text,
	`payee_address_line_2` text,
	`payee_address_line_3` text,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `petty_cash_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`vendor_id` integer,
	`category_id` integer NOT NULL,
	`note` text,
	`amount` real NOT NULL,
	`photo_url` text,
	`created_by_employee_id` integer NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`vendor_id`) REFERENCES `ledger_vendors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `ledger_categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
