import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLoginId, guessLoginIdDepartment } from "../loginId";

test("loginId: builds YK + yy + mm + dept digit + 3-digit sequence from hire date", () => {
  assert.equal(buildLoginId({ hireDate: "2026-08-15", department: "BOH", sequence: 7 }), "YK26081007");
});

test("loginId: department digits are 0=Partner, 1=BOH, 2=FOH", () => {
  assert.equal(buildLoginId({ hireDate: "2026-01-01", department: "PARTNER", sequence: 1 }), "YK2601" + "0" + "001");
  assert.equal(buildLoginId({ hireDate: "2026-01-01", department: "BOH", sequence: 1 }), "YK2601" + "1" + "001");
  assert.equal(buildLoginId({ hireDate: "2026-01-01", department: "FOH", sequence: 1 }), "YK2601" + "2" + "001");
});

test("loginId: sequence is zero-padded to 3 digits", () => {
  assert.equal(buildLoginId({ hireDate: "2026-01-01", department: "FOH", sequence: 1 }), "YK26012001");
  assert.equal(buildLoginId({ hireDate: "2026-01-01", department: "FOH", sequence: 42 }), "YK26012042");
  assert.equal(buildLoginId({ hireDate: "2026-01-01", department: "FOH", sequence: 999 }), "YK26012999");
});

test("loginId: falls back to the provided `now` when hireDate is null", () => {
  const id = buildLoginId({ hireDate: null, department: "FOH", sequence: 3, now: new Date("2027-03-10T00:00:00Z") });
  assert.equal(id, "YK2703" + "2" + "003");
});

test("loginId: rejects a sequence above 999", () => {
  assert.throws(() => buildLoginId({ hireDate: "2026-01-01", department: "FOH", sequence: 1000 }));
});

test("loginId: rejects a non-positive or non-integer sequence", () => {
  assert.throws(() => buildLoginId({ hireDate: "2026-01-01", department: "FOH", sequence: 0 }));
  assert.throws(() => buildLoginId({ hireDate: "2026-01-01", department: "FOH", sequence: 1.5 }));
});

test("loginId: rejects an invalid hire date string", () => {
  assert.throws(() => buildLoginId({ hireDate: "not-a-date", department: "FOH", sequence: 1 }));
});

test("guessLoginIdDepartment: partner flag wins over position category", () => {
  assert.equal(guessLoginIdDepartment({ isPartner: true, positionCategory: "FOH" }), "PARTNER");
  assert.equal(guessLoginIdDepartment({ isPartner: true, positionCategory: null }), "PARTNER");
});

test("guessLoginIdDepartment: falls back to position category when not a partner", () => {
  assert.equal(guessLoginIdDepartment({ isPartner: false, positionCategory: "BOH" }), "BOH");
  assert.equal(guessLoginIdDepartment({ isPartner: false, positionCategory: "FOH" }), "FOH");
  assert.equal(guessLoginIdDepartment({ isPartner: false, positionCategory: null }), "FOH");
});
