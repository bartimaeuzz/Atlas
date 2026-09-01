import type { ReactNode } from "react";
import { CheckIcon, AlertCircleIcon, AlertTriangleIcon } from "./icons";

type BannerTone = "success" | "danger" | "warning" | "info";

const toneStyles: Record<BannerTone, { bg: string; border: string; text: string; Icon: typeof CheckIcon }> = {
  success: { bg: "bg-[var(--success-tint)]", border: "border-[var(--success-border)]", text: "text-[var(--success-700)]", Icon: CheckIcon },
  danger: { bg: "bg-[var(--danger-tint)]", border: "border-[var(--danger-border)]", text: "text-[var(--danger-700)]", Icon: AlertCircleIcon },
  warning: { bg: "bg-[var(--warning-tint)]", border: "border-[var(--warning-border)]", text: "text-[var(--warning-700)]", Icon: AlertTriangleIcon },
  info: { bg: "bg-[var(--primary-tint)]", border: "border-[var(--primary-border)]", text: "text-[var(--primary-700)]", Icon: AlertCircleIcon },
};

/** Inline banner that stays on screen until the next action — deliberately
 * not a toast that auto-dismisses, per the 2026-08-16 feedback-pattern
 * decision (easy to miss on a phone mid-shift). success/danger = the
 * result of an action; warning = an informational heads-up (e.g. "this
 * record is locked"); info = neutral, lowest-stakes. */
export function Banner({ tone, title, description }: { tone: BannerTone; title: string; description?: ReactNode }) {
  const s = toneStyles[tone];
  const Icon = s.Icon;
  // Announce the banner when it appears (2026-09-01 visual audit). This
  // component is how ~47 files report "Couldn't save" / "Wrong PIN" /
  // "Couldn't add expense", and it carried no role or aria-live at all —
  // every failure in Atlas was silent to anyone not watching that exact
  // spot on the screen. WCAG 4.1.3 Status Messages (AA).
  //
  // danger/warning are assertive because they report something that just
  // went wrong and the person is mid-task; success/info are polite so a
  // "Saved ✓" never interrupts what someone is typing.
  const assertive = tone === "danger" || tone === "warning";
  return (
    <div
      role={assertive ? "alert" : "status"}
      aria-live={assertive ? "assertive" : "polite"}
      className={`flex items-start gap-2.5 ${s.bg} border ${s.border} rounded-[var(--radius-md)] px-3.5 py-3`}
    >
      <Icon className={`${s.text} mt-0.5 shrink-0`} width={18} height={18} />
      <div>
        <div className={`text-sm font-semibold ${s.text}`}>{title}</div>
        {description && <div className={`text-xs ${s.text} mt-0.5 opacity-90`}>{description}</div>}
      </div>
    </div>
  );
}
