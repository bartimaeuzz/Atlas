CREATE TABLE `shift_weather_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`restaurant_id` integer DEFAULT 1 NOT NULL,
	`date` text NOT NULL,
	`period` text NOT NULL,
	`weather_code` integer NOT NULL,
	`temp_high_f` real,
	`temp_low_f` real,
	`precip_inches` real,
	`captured_at` text NOT NULL,
	`source` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_shift_weather` ON `shift_weather_records` (`restaurant_id`,`date`,`period`);--> statement-breakpoint
CREATE TABLE `weather_locations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`restaurant_id` integer DEFAULT 1 NOT NULL,
	`label` text NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by_employee_id` integer,
	FOREIGN KEY (`updated_by_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weather_locations_restaurant_id_unique` ON `weather_locations` (`restaurant_id`);