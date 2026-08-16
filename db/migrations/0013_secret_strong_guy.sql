CREATE TABLE `card_statement_periods` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`card_id` integer NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`statement_total` real NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`reconciled_at` text,
	`reconciled_by_employee_id` integer,
	`created_by_employee_id` integer NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `ledger_cards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reconciled_by_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `card_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`statement_period_id` integer NOT NULL,
	`date` text NOT NULL,
	`category_id` integer NOT NULL,
	`memo` text,
	`amount` real NOT NULL,
	`created_by_employee_id` integer NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`statement_period_id`) REFERENCES `card_statement_periods`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `ledger_categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ledger_cards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
