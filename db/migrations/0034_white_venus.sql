PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_swap_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`assignment_id` integer,
	`detached_shift_date` text,
	`detached_shift_period` text,
	`detached_position_id` integer,
	`requesting_employee_id` integer NOT NULL,
	`accepting_employee_id` integer,
	`status` text DEFAULT 'open' NOT NULL,
	`note` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`responded_at` text,
	`decided_at` text,
	`decided_by_employee_id` integer,
	FOREIGN KEY (`assignment_id`) REFERENCES `planned_shift_assignments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`detached_position_id`) REFERENCES `positions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requesting_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`accepting_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`decided_by_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
-- HAND-CORRECTED (2026-08-30): drizzle-kit generated this SELECT reading the
-- three new detached_* columns FROM THE OLD TABLE, which does not have them.
-- SQLite's double-quoted-identifier misfeature turns each unknown column into
-- a STRING LITERAL instead of an error, so the generated form silently filled
-- every existing row's snapshot columns with their own column names as text
-- (verified on a local copy before this edit). New columns start NULL.
INSERT INTO `__new_swap_requests`("id", "assignment_id", "detached_shift_date", "detached_shift_period", "detached_position_id", "requesting_employee_id", "accepting_employee_id", "status", "note", "created_at", "responded_at", "decided_at", "decided_by_employee_id") SELECT "id", "assignment_id", NULL, NULL, NULL, "requesting_employee_id", "accepting_employee_id", "status", "note", "created_at", "responded_at", "decided_at", "decided_by_employee_id" FROM `swap_requests`;--> statement-breakpoint
DROP TABLE `swap_requests`;--> statement-breakpoint
ALTER TABLE `__new_swap_requests` RENAME TO `swap_requests`;--> statement-breakpoint
PRAGMA foreign_keys=ON;