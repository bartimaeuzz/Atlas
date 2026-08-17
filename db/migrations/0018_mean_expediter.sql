CREATE TABLE `payroll_period_employee_totals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`payroll_period_id` integer NOT NULL,
	`employee_id` integer NOT NULL,
	`shift_count` integer DEFAULT 0 NOT NULL,
	`flat_wage_amount` real DEFAULT 0 NOT NULL,
	`extra_pay_amount` real DEFAULT 0 NOT NULL,
	`incentive_amount` real DEFAULT 0 NOT NULL,
	`deduction_amount` real DEFAULT 0 NOT NULL,
	`tip_pool_share` real DEFAULT 0 NOT NULL,
	`host_upsell_tip_share` real DEFAULT 0 NOT NULL,
	`total_tip` real DEFAULT 0 NOT NULL,
	`total_core_payout` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`payroll_period_id`) REFERENCES `payroll_periods`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `payroll_periods` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`week_start_date` text NOT NULL,
	`week_end_date` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`paid_at` text,
	`paid_by_employee_id` integer,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`paid_by_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_payroll_week_start` ON `payroll_periods` (`week_start_date`);