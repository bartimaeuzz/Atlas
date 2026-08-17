import { redirect } from "next/navigation";

/** 2026-08-17 — Employees was renamed to People (Oliver: "change employees
 * page to People"). Keeps the old /employees URL alive as a redirect so
 * any existing bookmark/link doesn't 404. See app/(protected)/people/
 * for the real page. */
export default function EmployeesRedirectPage() {
  redirect("/people");
}
