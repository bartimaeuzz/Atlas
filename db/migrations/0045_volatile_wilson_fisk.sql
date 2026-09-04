CREATE TABLE `sales_target_dates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`restaurant_id` integer DEFAULT 1 NOT NULL,
	`date` text NOT NULL,
	`net_sales_target` real NOT NULL,
	`label` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_sales_target_date` ON `sales_target_dates` (`restaurant_id`,`date`);--> statement-breakpoint
CREATE TABLE `sales_target_weekdays` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`restaurant_id` integer DEFAULT 1 NOT NULL,
	`day_of_week` integer NOT NULL,
	`net_sales_target` real NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_sales_target_weekday` ON `sales_target_weekdays` (`restaurant_id`,`day_of_week`);