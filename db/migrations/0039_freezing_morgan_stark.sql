ALTER TABLE `card_statement_periods` ADD `single_person` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `payroll_periods` ADD `single_person` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `restaurant_settings` ADD `require_two_person_payroll` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `restaurant_settings` ADD `require_two_person_card_reconcile` integer DEFAULT false NOT NULL;