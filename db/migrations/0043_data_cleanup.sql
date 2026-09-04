-- Data cleanup, not a schema change (2026-09-04, Oliver's three calls).
-- Same shape as 0036: primary-key addressed, every statement guarded so a
-- re-run is a no-op, run through `npm run db:migrate` like everything else.
-- Every row below was read off atlas-prod on 2026-09-04 and is named here
-- explicitly; nothing is matched by pattern alone.
--
-- ============================================================================
-- 1. Five of the seven planned assignments sitting on approved leave -> CLEARED.
--    (commit e944610 left them in place; Oliver now says clear them.)
--    Scrutinize 2026-09-04: 1012 and 1013 (Oliver, 2026-08-26 Lunch/Dinner)
--    were already consumed into FINALIZED shifts 32/33 with locked payouts
--    357/369. Deleting them would publish a log line contradicting payroll,
--    so Oliver chose to leave those two alone. Only the five below are touched.
--    Mirrors removePlannedAssignment in lib/actions/schedule.ts exactly:
--      * the swap gate (lib/schedule/swapDetach.ts) has nothing to do --
--        zero swap_requests reference any of these seven ids (checked);
--      * DELETE the planned_shift_assignments row;
--      * when the week is PUBLISHED, one schedule_change_log row per
--        removal, action REMOVED_ASSIGNMENT, was_published=1, with the
--        removed slot snapshotted as JSON (employeeName/positionName
--        denormalized the way logScheduleChange does it). Week 11
--        (2026-08-24) is published -> four log rows. Week 13 (2026-08-10)
--        is a draft -> id 1394 is deleted with no log row, same as the app.
--    The app writes reason=NULL for a single-slot removal; here a reason is
--    written so the staff-facing view says why. performed_by = Oliver (16,
--    ADMIN), who made the call -- a migration has no session to read.
--    The log INSERT runs BEFORE its DELETE and is guarded on the assignment
--    still existing, so re-running never duplicates a log row.
--
--    Prod rows (leave 4 = Oliver 2026-08-25..31 approved; leave 2 = Bomb
--    2026-08-16 approved):
--      1012, 1013 (2026-08-26) KEPT -- see note above
--      1015 Oliver Bartender 2026-08-30 Dinner FROM_TEMPLATE  week 11 published
--      1142 Oliver Server    2026-08-27 Dinner AUTO_FILL      week 11 published
--      1150 Oliver Server    2026-08-29 Dinner AUTO_FILL      week 11 published
--      1154 Oliver Server    2026-08-28 Dinner AUTO_FILL      week 11 published
--      1394 Bomb   Head Chef 2026-08-16 Dinner FROM_TEMPLATE  week 13 draft
-- ============================================================================
INSERT INTO schedule_change_log (week_id, week_start_date, action, date, was_published, reason, performed_by_employee_id, performed_by_name, removed_assignments)
SELECT 11, '2026-08-24', 'REMOVED_ASSIGNMENT', '2026-08-30', 1, 'Data cleanup (migration 0043): assignment overlapped approved leave', 16, 'Oliver',
       '[{"employeeId":16,"employeeName":"Oliver","positionId":2,"positionName":"Bartender","date":"2026-08-30","period":"Dinner"}]'
WHERE EXISTS (SELECT 1 FROM planned_shift_assignments WHERE id = 1015 AND employee_id = 16 AND position_id = 2 AND date = '2026-08-30' AND period = 'Dinner') AND NOT EXISTS (SELECT 1 FROM swap_requests s WHERE s.assignment_id = 1015);--> statement-breakpoint
INSERT INTO schedule_change_log (week_id, week_start_date, action, date, was_published, reason, performed_by_employee_id, performed_by_name, removed_assignments)
SELECT 11, '2026-08-24', 'REMOVED_ASSIGNMENT', '2026-08-27', 1, 'Data cleanup (migration 0043): assignment overlapped approved leave', 16, 'Oliver',
       '[{"employeeId":16,"employeeName":"Oliver","positionId":12,"positionName":"Server","date":"2026-08-27","period":"Dinner"}]'
WHERE EXISTS (SELECT 1 FROM planned_shift_assignments WHERE id = 1142 AND employee_id = 16 AND position_id = 12 AND date = '2026-08-27' AND period = 'Dinner') AND NOT EXISTS (SELECT 1 FROM swap_requests s WHERE s.assignment_id = 1142);--> statement-breakpoint
INSERT INTO schedule_change_log (week_id, week_start_date, action, date, was_published, reason, performed_by_employee_id, performed_by_name, removed_assignments)
SELECT 11, '2026-08-24', 'REMOVED_ASSIGNMENT', '2026-08-29', 1, 'Data cleanup (migration 0043): assignment overlapped approved leave', 16, 'Oliver',
       '[{"employeeId":16,"employeeName":"Oliver","positionId":12,"positionName":"Server","date":"2026-08-29","period":"Dinner"}]'
WHERE EXISTS (SELECT 1 FROM planned_shift_assignments WHERE id = 1150 AND employee_id = 16 AND position_id = 12 AND date = '2026-08-29' AND period = 'Dinner') AND NOT EXISTS (SELECT 1 FROM swap_requests s WHERE s.assignment_id = 1150);--> statement-breakpoint
INSERT INTO schedule_change_log (week_id, week_start_date, action, date, was_published, reason, performed_by_employee_id, performed_by_name, removed_assignments)
SELECT 11, '2026-08-24', 'REMOVED_ASSIGNMENT', '2026-08-28', 1, 'Data cleanup (migration 0043): assignment overlapped approved leave', 16, 'Oliver',
       '[{"employeeId":16,"employeeName":"Oliver","positionId":12,"positionName":"Server","date":"2026-08-28","period":"Dinner"}]'
WHERE EXISTS (SELECT 1 FROM planned_shift_assignments WHERE id = 1154 AND employee_id = 16 AND position_id = 12 AND date = '2026-08-28' AND period = 'Dinner') AND NOT EXISTS (SELECT 1 FROM swap_requests s WHERE s.assignment_id = 1154);--> statement-breakpoint
DELETE FROM planned_shift_assignments WHERE id IN (1015, 1142, 1150, 1154) AND employee_id = 16 AND week_id = 11
  AND NOT EXISTS (SELECT 1 FROM swap_requests s WHERE s.assignment_id = planned_shift_assignments.id);--> statement-breakpoint
DELETE FROM planned_shift_assignments WHERE id = 1394 AND employee_id = 3 AND week_id = 13 AND date = '2026-08-16' AND period = 'Dinner'
  AND NOT EXISTS (SELECT 1 FROM swap_requests s WHERE s.assignment_id = planned_shift_assignments.id);--> statement-breakpoint
-- ============================================================================
-- 2. "Card draft periods 2 and 4 typed as net totals" (PROGRESS.md / 0258ab6)
--    -> NOTHING TO DO. Those periods no longer exist: ADMIN hard-deleted
--    cards 1 and 2 (and every period under them, ids 1-4) on 2026-08-26 via
--    deleteLedgerCard (activity_log 4 and 6). The only surviving periods are
--    5 (reconciled) and 6 (draft, AMEX 08-24..08-30) and neither is the one
--    the note describes. Deliberately no statement here.
-- ============================================================================
-- 3. Nine legacy checks with empty check numbers -> CLOSED OUT.
--    Mirrors markSupplierCheckPaid in lib/actions/supplierCheck.ts exactly:
--    payment.status='closed', delivered_at=now (JS toISOString shape),
--    delivered_by_employee_id=actor; then every linked supplier_invoices row
--    -> 'closed'. That action writes NO supplier_check_audit_log row and
--    does NOT require a check number, so nothing is bypassed. Void rows are
--    never touched (none of the nine is void). check_number stays empty --
--    the lifecycle commit (79cb413) keeps legacy numbers empty and badged.
--    Actor = Oliver (16), who made the call.
--
--    Already closed in prod, untouched by the status guard: 1 (Asia Market
--    3246.66), 2 (Baldor 200), 5 (Auto-Chlor 750).
--    Exported -> closed here:
--      3 Bronx Freight and Fish 2000  (invoice 4)
--      4 J and J                 200  (invoice 5)
--      6 Asia Market Corporation 2000 (invoice 8)
--      7 Asia Market Corporation 555  (invoices 10, 11)
--      8 Auto-Chlor              111  (invoice 9)
--      9 OAK Beverage            888  (invoices 12, 13)
-- ============================================================================
UPDATE supplier_check_payments
   SET status = 'closed', delivered_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), delivered_by_employee_id = 16
 WHERE id IN (3, 4, 6, 7, 8, 9) AND status = 'exported' AND (check_number IS NULL OR check_number = '');--> statement-breakpoint
UPDATE supplier_invoices SET status = 'closed'
 WHERE payment_id IN (3, 4, 6, 7, 8, 9) AND status = 'exported'
   AND EXISTS (SELECT 1 FROM supplier_check_payments p WHERE p.id = supplier_invoices.payment_id AND p.status = 'closed');
