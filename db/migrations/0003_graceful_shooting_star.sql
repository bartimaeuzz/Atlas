ALTER TABLE `online_platform_sales_records` ADD `tax_amount` real;--> statement-breakpoint
ALTER TABLE `restaurant_settings` ADD `default_sales_tax_rate` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `shift_sales` ADD `sales_tax` real;