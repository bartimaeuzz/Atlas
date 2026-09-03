import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Design-system guardrails (2026-09-02, Mohom rollout). These are the
// load-bearing anti-decay rules: the old type system rotted into 115
// arbitrary text sizes precisely because nothing failed on them. Each
// pattern below was swept to zero across the codebase first, so these fail
// only on NEW violations. They match string literals AND template-literal
// chunks (className={`...`}); comments are AST-free and never match, so a
// history comment naming an old colour is safe.
//
// NOT YET here, deliberately: a window.confirm/alert/prompt ban (7 real
// call sites still use it; they need replacing with the DangerConfirmDialog
// primitive first — its own task) and an unlabelled-nav-item rule (needs a
// custom rule, low value). Add the confirm rule once those 7 are migrated.
const RESTRICTED = [
  {
    selector: "Literal[value=/text-\\[[0-9.]+px\\]/]",
    message: "Arbitrary text size. Use the type scale (text-xs…text-3xl or a --text-* token), never text-[Npx].",
  },
  {
    selector: "TemplateElement[value.raw=/text-\\[[0-9.]+px\\]/]",
    message: "Arbitrary text size. Use the type scale (text-xs…text-3xl or a --text-* token), never text-[Npx].",
  },
  {
    selector: "Literal[value=/rounded(-[tlbrse]{1,2})?-\\[[0-9]+px\\]/]",
    message: "Arbitrary radius. Use rounded-[var(--radius-md)] (6px) or --radius-none/--radius-full.",
  },
  {
    selector: "TemplateElement[value.raw=/rounded(-[tlbrse]{1,2})?-\\[[0-9]+px\\]/]",
    message: "Arbitrary radius. Use rounded-[var(--radius-md)] (6px) or --radius-none/--radius-full.",
  },
  {
    selector: "Literal[value=/-\\[#[0-9a-fA-F]{3,8}\\]/]",
    message: "Raw hex in a class. Use a Mohom token: var(--ink-900), var(--primary), var(--dip-N), etc.",
  },
  {
    selector: "TemplateElement[value.raw=/-\\[#[0-9a-fA-F]{3,8}\\]/]",
    message: "Raw hex in a class. Use a Mohom token: var(--ink-900), var(--primary), var(--dip-N), etc.",
  },
  {
    selector:
      "Literal[value=/(bg|text|border|ring|from|to|via|fill|stroke)-(red|orange|amber|yellow|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-(50|100|200|300|400|500|600|700|800|900|950)/]",
    message:
      "Tailwind named colour. Mohom has no such hue: use a status token (--success/--warning/--danger), the indigo ramp (--dip-N) for categorical, or an --ink-*/--border-* neutral.",
  },
  {
    selector:
      "TemplateElement[value.raw=/(bg|text|border|ring|from|to|via|fill|stroke)-(red|orange|amber|yellow|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-(50|100|200|300|400|500|600|700|800|900|950)/]",
    message:
      "Tailwind named colour. Mohom has no such hue: use a status token (--success/--warning/--danger), the indigo ramp (--dip-N) for categorical, or an --ink-*/--border-* neutral.",
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // The design-system guardrails apply to app + components only — the
    // analytics chart palette (a colour-vision-validated categorical set)
    // and any generator are out of scope.
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    ignores: ["app/(protected)/analytics/palette.ts"],
    rules: {
      "no-restricted-syntax": ["error", ...RESTRICTED],
    },
  },
]);

export default eslintConfig;
