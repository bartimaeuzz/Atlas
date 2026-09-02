import type { ReactNode } from "react";
import { CheckIcon, AlertCircleIcon, AlertTriangleIcon } from "./icons";
import { Announce } from "./Announce";

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
export function Banner({
  tone,
  title,
  description,
  announce = true,
  announceKey,
}: {
  tone: BannerTone;
  title: string;
  description?: ReactNode;
  /** Speak this banner through the shared live region when it appears.
   * Default true. Set false for a banner that is part of the initial page
   * (a "this day is finalized" state notice), which a screen reader reads
   * in normal document order — re-announcing it on every load is noise. */
  announce?: boolean;
  /** Identity of the event that produced this message (pass the
   * useActionState `state`), so an identical error twice in a row is
   * re-announced. See Announce.tsx. */
  announceKey?: unknown;
}) {
  const s = toneStyles[tone];
  const Icon = s.Icon;
  // Announce the banner when it appears (2026-09-01 visual audit; fixed
  // properly 2026-09-02). This component is how ~47 files report
  // "Couldn't save" / "Wrong PIN" / "Couldn't add expense". The first fix
  // put role/aria-live on THIS node — but callers mount a Banner
  // conditionally, so the live region and its text arrived in the same
  // render and many screen readers said nothing (WCAG 4.1.3). The text now
  // goes through the two regions that are always on the page
  // (components/ui/LiveRegions.tsx) via <Announce>; this node stays a
  // plain visual box so the message is never spoken twice.
  //
  // danger/warning are assertive because they report something that just
  // went wrong and the person is mid-task; success/info are polite so a
  // "Saved ✓" never interrupts what someone is typing. Only string
  // descriptions are spoken; a rich ReactNode description is visual-only.
  const assertive = tone === "danger" || tone === "warning";
  const spoken = typeof description === "string" ? `${title}. ${description}` : title;
  return (
    <div className={`flex items-start gap-2.5 ${s.bg} border ${s.border} rounded-[var(--radius-md)] px-3.5 py-3`}>
      {announce && <Announce text={spoken} assertive={assertive} announceKey={announceKey} />}
      <Icon className={`${s.text} mt-0.5 shrink-0`} width={18} height={18} />
      <div>
        <div className={`text-sm font-semibold ${s.text}`}>{title}</div>
        {description && <div className={`text-xs ${s.text} mt-0.5 opacity-90`}>{description}</div>}
      </div>
    </div>
  );
}
