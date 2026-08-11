ALTER TABLE `employee_payouts` ADD `deduction_amount` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `shift_wage_adjustments` ADD `deduction_amount` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `shift_wage_adjustments` ADD `deduction_reason` text;