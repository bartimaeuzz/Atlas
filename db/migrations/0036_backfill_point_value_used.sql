-- Data correction, not a schema change: restore point_value_used on the 5
-- locked payout rows the pre-ca48c4b bug stored as NULL (Aey's first test,
-- shifts 32/33 on 2026-08-26). NO MONEY FIELD IS TOUCHED -- every share,
-- wage, tip and total in these rows is already correct.
--
-- Shipped as a migration so it runs through the same `npm run db:migrate`
-- flow as everything else (Oliver asked how to run the loose SQL file this
-- replaces -- the answer is that he shouldn't have to know a second tool).
--
-- Addressed by primary key; the `point_value_used IS NULL` guard makes every
-- statement a no-op on re-run and refuses to overwrite any later value.
-- Each number is independently confirmed by arithmetic, not just read off
-- the override column: shift 32 paid 98.65/point (Oliver 88.78/98.65=0.90),
-- shift 33 paid 243.31/point (Carlos 231.15/243.31=0.95, Film 0.80,
-- Sammuel 0.85, TEST 0.85).
UPDATE employee_payouts SET point_value_used = 0.9  WHERE id = 357 AND point_value_used IS NULL;--> statement-breakpoint
UPDATE employee_payouts SET point_value_used = 0.8  WHERE id = 365 AND point_value_used IS NULL;--> statement-breakpoint
UPDATE employee_payouts SET point_value_used = 0.95 WHERE id = 376 AND point_value_used IS NULL;--> statement-breakpoint
UPDATE employee_payouts SET point_value_used = 0.85 WHERE id = 377 AND point_value_used IS NULL;--> statement-breakpoint
UPDATE employee_payouts SET point_value_used = 0.85 WHERE id = 378 AND point_value_used IS NULL;
