import type { WeatherIconName } from "@/lib/weather/wmo";

/** Eight weather marks, drawn as inline SVG in the same 24-box, 1.5-stroke,
 * currentColor style as every other icon in this app (see app/page.tsx's
 * iconProps) so a sky icon never looks imported from somewhere else.
 *
 * They are deliberately distinguishable by SHAPE, not only by the colour
 * they inherit: rain has straight strokes, snow has crosses, the storm has a
 * bolt. Colour is a second signal here, never the only one — WCAG 1.4.1 and
 * the convention the labor figure already follows on these same screens.
 *
 * `aria-hidden` on the mark itself: every caller renders the condition in
 * words beside it or in an aria-label around it, so announcing the icon too
 * would read the weather twice.
 */
export function WeatherIcon({
  name,
  size = 20,
  className = "",
}: {
  name: WeatherIconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={"shrink-0 " + className}
    >
      {MARKS[name]}
    </svg>
  );
}

const SUN = (
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
  </>
);

/** The plain cloud sits low, filling the box. */
const CLOUD_LOW = <path d="M7 19h10a4 4 0 0 0 .4-8 6 6 0 0 0-11.5 1.6A3.5 3.5 0 0 0 7 19z" />;

/** The same cloud lifted and shrunk, so the drops and the bolt have room to
 * fall inside the 24-box instead of being clipped by it. */
const CLOUD_HIGH = <path d="M7 15.5h9.5a3.6 3.6 0 0 0 .4-7.2A5.4 5.4 0 0 0 6.4 9.7 3.2 3.2 0 0 0 7 15.5z" />;

const MARKS: Record<WeatherIconName, React.ReactNode> = {
  clear: SUN,
  partly: (
    <>
      <circle cx="8.5" cy="7.5" r="3" />
      <path d="M8.5 1.8v1.4M2.8 7.5h1.4M4.5 3.5l1 1M12.5 3.5l-1 1" />
      <path d="M8 20h9a3.8 3.8 0 0 0 .4-7.6 5.6 5.6 0 0 0-10.7 1.5A3.3 3.3 0 0 0 8 20z" />
    </>
  ),
  cloudy: CLOUD_LOW,
  fog: (
    <>
      <path d="M6.5 13.5a3.6 3.6 0 0 1 .4-7.2 5.4 5.4 0 0 1 10.5 1.4 3.6 3.6 0 0 1 .4 5.8" />
      <path d="M4 17h16M6.5 20.5h11" />
    </>
  ),
  drizzle: (
    <>
      {CLOUD_HIGH}
      <path d="M9 18.5v1.5M13 18.5v1.5M17 18.5v1.5" />
    </>
  ),
  rain: (
    <>
      {CLOUD_HIGH}
      <path d="M9.5 18l-1.2 3.5M13.5 18l-1.2 3.5M17.5 18l-1.2 3.5" />
    </>
  ),
  snow: (
    <>
      {CLOUD_HIGH}
      <path d="M7.6 20h2M8.6 19v2M12.6 20h2M13.6 19v2M17.6 20h2M18.6 19v2" />
    </>
  ),
  storm: (
    <>
      {CLOUD_HIGH}
      <path d="M13.4 17.2l-3.4 3.6h2.9l-2.2 3.1" />
    </>
  ),
};
