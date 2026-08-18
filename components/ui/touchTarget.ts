/** Utility class fragment for standalone small text links/buttons whose
 * visible content is smaller than WCAG 2.5.8's 24x24 CSS px legal floor
 * for touch targets -- e.g. a plain underlined "Forgot PIN?" link, or a
 * small "+ Request leave" toggle button. Expands the element's actual
 * clickable/tappable box via padding, then cancels the vertical padding
 * with an equal negative margin so surrounding layout (row height, flex
 * gaps) doesn't shift -- the growth is real for hit-testing purposes but
 * invisible for layout purposes. Horizontal padding is left uncancelled
 * (a few extra px of width here is low-risk and desirable).
 *
 * Apply this directly on the interactive element itself (the <a>/
 * <button>/<Link>), never on a wrapping <div>/<span> -- padding on a
 * non-interactive parent does not extend a child link's real hit area,
 * only the interactive element's own padding box does.
 *
 * Scope: standalone tap targets only (a link/button that is the whole
 * point of its own line or its own row), not links embedded mid-sentence
 * in a paragraph -- those are exempt from 2.5.8 under its own "Inline"
 * exception, and adding this padding to one would visually break the
 * paragraph's line flow. See project_atlas_design_retrofit_backlog.md
 * for the full list of instances this was applied to on 2026-08-18, and
 * which ones were deliberately left out because they're inline-in-prose.
 */
export const TAP_TARGET_PAD = "-my-2 py-2 px-1";
