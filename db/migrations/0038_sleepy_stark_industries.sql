DROP INDEX "activity_log_at_idx";--> statement-breakpoint
DROP INDEX "activity_log_type_idx";--> statement-breakpoint
DROP INDEX "activity_log_entity_idx";--> statement-breakpoint
DROP INDEX "daily_cash_reconciliations_date_unique";--> statement-breakpoint
DROP INDEX "uniq_employee_capability";--> statement-breakpoint
DROP INDEX "uniq_employee_position";--> statement-breakpoint
DROP INDEX "uniq_rule_employee";--> statement-breakpoint
DROP INDEX "uniq_template_employee_position_day_period";--> statement-breakpoint
DROP INDEX "employees_login_id_unique";--> statement-breakpoint
DROP INDEX "uniq_vendor_tag";--> statement-breakpoint
DROP INDEX "metric_definitions_key_unique";--> statement-breakpoint
DROP INDEX "notification_seen_employee_section_idx";--> statement-breakpoint
DROP INDEX "uniq_payroll_week_start";--> statement-breakpoint
DROP INDEX "uniq_planned_assignment_week_employee_position_date_period";--> statement-breakpoint
DROP INDEX "uniq_position_metric";--> statement-breakpoint
DROP INDEX "uniq_position_period";--> statement-breakpoint
DROP INDEX "uniq_staffing_target_position_day_period";--> statement-breakpoint
DROP INDEX "uniq_position_tip_pool";--> statement-breakpoint
DROP INDEX "schedule_weeks_week_start_date_unique";--> statement-breakpoint
DROP INDEX "uniq_attendance_shift_employee";--> statement-breakpoint
DROP INDEX "shift_sales_shift_id_unique";--> statement-breakpoint
DROP INDEX "uniq_shift_wage_adjustment";--> statement-breakpoint
DROP INDEX "uniq_date_period";--> statement-breakpoint
DROP INDEX "staff_sessions_token_unique";--> statement-breakpoint
DROP INDEX "tip_pool_calculations_shift_id_unique";--> statement-breakpoint
ALTER TABLE `supplier_check_payments` ALTER COLUMN "status" TO "status" text NOT NULL DEFAULT 'exported';--> statement-breakpoint
CREATE INDEX `activity_log_at_idx` ON `activity_log` (`at`);--> statement-breakpoint
CREATE INDEX `activity_log_type_idx` ON `activity_log` (`type`);--> statement-breakpoint
CREATE INDEX `activity_log_entity_idx` ON `activity_log` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `daily_cash_reconciliations_date_unique` ON `daily_cash_reconciliations` (`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_employee_capability` ON `employee_capabilities` (`employee_id`,`capability_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_employee_position` ON `employee_positions` (`employee_id`,`position_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_rule_employee` ON `employee_rule_weights` (`rule_id`,`employee_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_template_employee_position_day_period` ON `employee_schedule_templates` (`employee_id`,`position_id`,`day_of_week`,`period`);--> statement-breakpoint
CREATE UNIQUE INDEX `employees_login_id_unique` ON `employees` (`login_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_vendor_tag` ON `ledger_vendor_tags` (`vendor_id`,`tag`);--> statement-breakpoint
CREATE UNIQUE INDEX `metric_definitions_key_unique` ON `metric_definitions` (`key`);--> statement-breakpoint
CREATE UNIQUE INDEX `notification_seen_employee_section_idx` ON `notification_seen` (`employee_id`,`section`);--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_payroll_week_start` ON `payroll_periods` (`week_start_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_planned_assignment_week_employee_position_date_period` ON `planned_shift_assignments` (`week_id`,`employee_id`,`position_id`,`date`,`period`);--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_position_metric` ON `position_metrics` (`position_id`,`metric_definition_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_position_period` ON `position_shift_rates` (`position_id`,`period`);--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_staffing_target_position_day_period` ON `position_staffing_targets` (`position_id`,`day_of_week`,`period`);--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_position_tip_pool` ON `position_tip_pools` (`position_id`,`tip_pool_group`);--> statement-breakpoint
CREATE UNIQUE INDEX `schedule_weeks_week_start_date_unique` ON `schedule_weeks` (`week_start_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_attendance_shift_employee` ON `shift_attendance_marks` (`shift_id`,`employee_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `shift_sales_shift_id_unique` ON `shift_sales` (`shift_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_shift_wage_adjustment` ON `shift_wage_adjustments` (`shift_id`,`employee_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_date_period` ON `shifts` (`date`,`period`);--> statement-breakpoint
CREATE UNIQUE INDEX `staff_sessions_token_unique` ON `staff_sessions` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `tip_pool_calculations_shift_id_unique` ON `tip_pool_calculations` (`shift_id`);--> statement-breakpoint
ALTER TABLE `supplier_check_payments` ADD `voided_at` text;--> statement-breakpoint
ALTER TABLE `supplier_check_payments` ADD `voided_by_employee_id` integer REFERENCES employees(id);--> statement-breakpoint
ALTER TABLE `supplier_check_payments` ADD `void_reason` text;--> statement-breakpoint
ALTER TABLE `supplier_check_payments` ADD `single_person` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `supplier_check_payments` ADD `instant_reason` text;--> statement-breakpoint
ALTER TABLE `supplier_invoices` ALTER COLUMN "status" TO "status" text NOT NULL DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE `supplier_invoices` ADD `ready_at` text;--> statement-breakpoint
ALTER TABLE `supplier_invoices` ADD `ready_by_employee_id` integer REFERENCES employees(id);--> statement-breakpoint
ALTER TABLE `restaurant_settings` ADD `next_check_number` integer;--> statement-breakpoint
ALTER TABLE `restaurant_settings` ADD `instant_check_ceiling` real DEFAULT 500 NOT NULL;--> statement-breakpoint
UPDATE `supplier_invoices` SET status='draft' WHERE status='pending';--> statement-breakpoint
UPDATE `supplier_invoices` SET status='exported' WHERE status='printed';--> statement-breakpoint
UPDATE `supplier_invoices` SET status='closed' WHERE status='paid';--> statement-breakpoint
UPDATE `supplier_check_payments` SET status='exported' WHERE status='printed';--> statement-breakpoint
UPDATE `supplier_check_payments` SET status='closed' WHERE status='paid';
