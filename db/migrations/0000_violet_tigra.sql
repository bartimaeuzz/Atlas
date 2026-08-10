CREATE TABLE `delivery_cash_tip_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shift_id` integer NOT NULL,
	`employee_id` integer NOT NULL,
	`amount` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `employee_payouts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shift_id` integer NOT NULL,
	`employee_id` integer NOT NULL,
	`point_value_used` real,
	`tip_pool_share` real DEFAULT 0 NOT NULL,
	`pool1_share` real DEFAULT 0 NOT NULL,
	`pool2_share` real DEFAULT 0 NOT NULL,
	`pool3_share` real DEFAULT 0 NOT NULL,
	`flat_wage_amount` real DEFAULT 0 NOT NULL,
	`host_upsell_tip_share` real,
	`extra_pay_amount` real DEFAULT 0 NOT NULL,
	`total_tip` real DEFAULT 0 NOT NULL,
	`incentive_amount` real DEFAULT 0 NOT NULL,
	`total_core_payout` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `employee_positions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`position_id` integer NOT NULL,
	`tip_point_value` real DEFAULT 1 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`trained_date` text,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`position_id`) REFERENCES `positions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_employee_position` ON `employee_positions` (`employee_id`,`position_id`);--> statement-breakpoint
CREATE TABLE `employee_rule_weights` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rule_id` integer NOT NULL,
	`employee_id` integer NOT NULL,
	`weight` real DEFAULT 1 NOT NULL,
	`effective_from` text,
	FOREIGN KEY (`rule_id`) REFERENCES `incentive_rules`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_rule_employee` ON `employee_rule_weights` (`rule_id`,`employee_id`);--> statement-breakpoint
CREATE TABLE `employee_wage_rates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`position_id` integer NOT NULL,
	`period` text NOT NULL,
	`rate` real NOT NULL,
	`effective_from` text,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`position_id`) REFERENCES `positions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`hire_date` text,
	`primary_position_id` integer,
	`system_role` text DEFAULT 'STAFF' NOT NULL,
	`pin_hash` text,
	FOREIGN KEY (`primary_position_id`) REFERENCES `positions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `host_upsell_tip_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shift_id` integer NOT NULL,
	`employee_id` integer NOT NULL,
	`sale_amount` real DEFAULT 0 NOT NULL,
	`cc_tip_amount` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `incentive_payout_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rule_id` integer NOT NULL,
	`employee_id` integer NOT NULL,
	`period_type` text NOT NULL,
	`period_key` text NOT NULL,
	`computed_amount` real NOT NULL,
	`metric_snapshot` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`rule_id`) REFERENCES `incentive_rules`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `incentive_rule_conditions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rule_id` integer NOT NULL,
	`metric_key` text NOT NULL,
	`operator` text NOT NULL,
	`value` real NOT NULL,
	`value_to` real,
	FOREIGN KEY (`rule_id`) REFERENCES `incentive_rules`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `incentive_rule_targets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rule_id` integer NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	FOREIGN KEY (`rule_id`) REFERENCES `incentive_rules`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `incentive_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`enabled` integer DEFAULT true NOT NULL,
	`evaluation_period` text NOT NULL,
	`reward_type` text NOT NULL,
	`reward_value` real NOT NULL,
	`reward_cap` real,
	`distribution_method` text NOT NULL,
	`weight_source` text,
	`weight_metric_key` text,
	`pool_source_metric_key` text
);
--> statement-breakpoint
CREATE TABLE `metric_definitions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`value_type` text NOT NULL,
	`scope` text NOT NULL,
	`collection_moment` text NOT NULL,
	`required` integer DEFAULT false NOT NULL,
	`enabled` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `metric_definitions_key_unique` ON `metric_definitions` (`key`);--> statement-breakpoint
CREATE TABLE `metric_values` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`metric_definition_id` integer NOT NULL,
	`shift_id` integer NOT NULL,
	`employee_id` integer,
	`value` real NOT NULL,
	FOREIGN KEY (`metric_definition_id`) REFERENCES `metric_definitions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `online_platform_sales_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shift_id` integer NOT NULL,
	`online_platform_id` integer NOT NULL,
	`sales_amount` real DEFAULT 0 NOT NULL,
	`commission_fee` real DEFAULT 0 NOT NULL,
	`net_amount` real DEFAULT 0 NOT NULL,
	`tip_amount_platform_courier` real DEFAULT 0 NOT NULL,
	`tip_amount_restaurant_delivery` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`online_platform_id`) REFERENCES `online_platforms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `online_platforms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`restaurant_id` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `position_metrics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`position_id` integer NOT NULL,
	`metric_definition_id` integer NOT NULL,
	FOREIGN KEY (`position_id`) REFERENCES `positions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`metric_definition_id`) REFERENCES `metric_definitions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_position_metric` ON `position_metrics` (`position_id`,`metric_definition_id`);--> statement-breakpoint
CREATE TABLE `position_shift_rates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`position_id` integer NOT NULL,
	`period` text NOT NULL,
	`flat_rate` real NOT NULL,
	FOREIGN KEY (`position_id`) REFERENCES `positions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_position_period` ON `position_shift_rates` (`position_id`,`period`);--> statement-breakpoint
CREATE TABLE `position_tip_pools` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`position_id` integer NOT NULL,
	`tip_pool_group` text NOT NULL,
	FOREIGN KEY (`position_id`) REFERENCES `positions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_position_tip_pool` ON `position_tip_pools` (`position_id`,`tip_pool_group`);--> statement-breakpoint
CREATE TABLE `positions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`always_visible_in_roster` integer DEFAULT false NOT NULL,
	`earnings_hidden_from_staff` integer DEFAULT false NOT NULL,
	`grants_manager_access` integer DEFAULT false NOT NULL,
	`default_tip_point_value` real,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `restaurant_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`restaurant_id` integer DEFAULT 1 NOT NULL,
	`cc_tip_deduction_rate` real DEFAULT 0 NOT NULL,
	`roster_show_peer_earnings_foh` integer DEFAULT true NOT NULL,
	`roster_show_peer_earnings_boh` integer DEFAULT false NOT NULL,
	`pool1_split_method` text DEFAULT 'POINT_WEIGHTED' NOT NULL,
	`pool2_split_method` text DEFAULT 'POINT_WEIGHTED' NOT NULL,
	`pool3_split_method` text DEFAULT 'EQUAL_SPLIT' NOT NULL,
	`host_drink_bonus_per_drink_amount` real DEFAULT 0 NOT NULL,
	`roster_restrict_foh_to_own_category` integer DEFAULT true NOT NULL,
	`roster_restrict_boh_to_own_category` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shift_roster_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shift_id` integer NOT NULL,
	`employee_id` integer NOT NULL,
	`position_id` integer NOT NULL,
	`section_id` integer,
	`point_value_override` real,
	`override_reason` text,
	FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`position_id`) REFERENCES `positions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `shift_sales` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shift_id` integer NOT NULL,
	`total_sales` real DEFAULT 0 NOT NULL,
	`cc_tip_total` real DEFAULT 0 NOT NULL,
	`takeout_cc_tip` real DEFAULT 0 NOT NULL,
	`delivery_toast_tip` real DEFAULT 0 NOT NULL,
	`cash_sales` real DEFAULT 0 NOT NULL,
	`cash_tip` real DEFAULT 0 NOT NULL,
	`gross_food_sales` real DEFAULT 0 NOT NULL,
	`gross_beverage_sales` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shift_sales_shift_id_unique` ON `shift_sales` (`shift_id`);--> statement-breakpoint
CREATE TABLE `shift_wage_adjustments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shift_id` integer NOT NULL,
	`employee_id` integer NOT NULL,
	`wage_override_amount` real,
	`extra_pay_amount` real DEFAULT 0 NOT NULL,
	`reason` text,
	FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_shift_wage_adjustment` ON `shift_wage_adjustments` (`shift_id`,`employee_id`);--> statement-breakpoint
CREATE TABLE `shifts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`period` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`finalized_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_date_period` ON `shifts` (`date`,`period`);--> statement-breakpoint
CREATE TABLE `staff_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token` text NOT NULL,
	`employee_id` integer NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `staff_sessions_token_unique` ON `staff_sessions` (`token`);--> statement-breakpoint
CREATE TABLE `tip_pool_calculations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shift_id` integer NOT NULL,
	`gross_cc_tip` real NOT NULL,
	`deduction_rate` real NOT NULL,
	`net_cc_tip` real NOT NULL,
	`total_host_upsell_tip` real DEFAULT 0 NOT NULL,
	`net_host_upsell_tip` real DEFAULT 0 NOT NULL,
	`net_general_cc_tip` real NOT NULL,
	`per_role_breakdown` text,
	FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tip_pool_calculations_shift_id_unique` ON `tip_pool_calculations` (`shift_id`);