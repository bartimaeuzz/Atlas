DROP TABLE `ledger_vendor_tags`;--> statement-breakpoint
ALTER TABLE `employees` ADD `title` text;--> statement-breakpoint
ALTER TABLE `restaurant_settings` ADD `restaurant_name` text;--> statement-breakpoint
-- Grant rows for a capability key retired in the check-lifecycle rebuild
-- (79cb413). The registry no longer knows the key, so these rows render
-- nowhere and gate nothing; four accounts still carried them on prod.
DELETE FROM `employee_capabilities` WHERE `capability_key` = 'FA_SUPPLIER_CHECK_EDIT_LOCKED';
