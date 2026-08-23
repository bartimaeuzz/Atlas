import { test } from "node:test";
import assert from "node:assert/strict";
import { formatSystemRole, type SystemRole } from "../formatSystemRole";

test("formatSystemRole: an ADMIN is labelled Admin, not Manager", () => {
  // The actual bug, 2026-08-23: the nav rail and account menu both used
  // `systemRole === "STAFF" ? "Staff" : "Manager"`, so every ADMIN account
  // displayed "Manager" -- on a shared restaurant terminal where the role
  // line is the only thing telling you which account you are in, and where
  // an ADMIN holds every capability by bypass.
  assert.equal(formatSystemRole("ADMIN"), "Admin");
});

test("formatSystemRole: labels every role in the union", () => {
  const roles: SystemRole[] = ["STAFF", "MANAGER", "ADMIN"];
  assert.deepEqual(
    roles.map(formatSystemRole),
    ["Staff", "Manager", "Admin"]
  );
  // No role may fall through to another role's label -- the property the
  // original ternary violated. Distinct inputs, distinct outputs.
  assert.equal(new Set(roles.map(formatSystemRole)).size, roles.length);
});
