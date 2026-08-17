ALTER TABLE `ledger_categories` ADD `pnl_group` text DEFAULT 'OTHER_EXPENSE' NOT NULL;
--> statement-breakpoint
-- Backfill pnlGroup for whatever categories already exist on this
-- database (name-matched once, here, at migration time only -- the app
-- itself never matches on category name after this, only on the stored
-- pnlGroup tag, which stays editable from /ledger/categories). Matches
-- Bar/Food/PAYROLL BOH/PAYROLL FOH by exact name; anything else (Mis,
-- Fixed expenses, Car, SHM, or any category a restaurant added on its
-- own) already defaulted to OTHER_EXPENSE above, which is a reasonable
-- starting point to re-tag from the admin page.
UPDATE `ledger_categories` SET `pnl_group` = 'BEVERAGE_ALC' WHERE `name` = 'Bar';
--> statement-breakpoint
UPDATE `ledger_categories` SET `pnl_group` = 'FOOD' WHERE `name` = 'Food';
--> statement-breakpoint
UPDATE `ledger_categories` SET `pnl_group` = 'EXCLUDED' WHERE `name` IN ('PAYROLL BOH', 'PAYROLL FOH');
--> statement-breakpoint
-- New category (2026-08-16, Aey's request): non-alcoholic drinks tracked
-- separately from Food and from Bar/alcohol. Only inserted if a category
-- with this exact name doesn't already exist, so re-running against a
-- database where someone already added their own "Drinks" category
-- doesn't create a duplicate.
INSERT INTO `ledger_categories` (`name`, `active`, `pnl_group`)
SELECT 'Drinks', 1, 'BEVERAGE_NONALC'
WHERE NOT EXISTS (SELECT 1 FROM `ledger_categories` WHERE `name` = 'Drinks');