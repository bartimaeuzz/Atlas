import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentStaffSession } from "@/lib/auth/session";

/**
 * Tile home page (2026-08-16). Replaces the old static "/" page (a
 * leftover from the very first prototype — Shifts/Positions/Settings
 * buttons plus a "playground calculator" link that hasn't matched the
 * real feature set in a long time). "/" is now a role-aware dashboard:
 * everyone lands here after login (see lib/actions/auth.ts), and each
 * tile is one large, icon-labeled tap target rather than a text link —
 * matching the phone+desktop, low-computer-literacy-friendly bar the
 * rest of the app is held to (see project_atlas_target_users_accessibility
 * memory). Not signed in at all -> straight to /login, since there's
 * nothing useful to show an anonymous visitor here anymore.
 */

interface Tile {
  href: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const iconProps = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const MANAGER_TILES: Tile[] = [
  {
    href: "/shifts",
    label: "Shifts",
    description: "Log daily sales, tips, and closing reports",
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M3 9h18M8 2v4M16 2v4" />
      </svg>
    ),
  },
  {
    href: "/employees",
    label: "Employees",
    description: "Manage staff profiles, pay, and PINs",
    icon: (
      <svg {...iconProps}>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" />
        <path d="M16 4.5c1.7.3 3 1.9 3 3.7s-1.3 3.4-3 3.7" />
        <path d="M17.5 13.7c2.3.6 4 2.9 4 6.3" />
      </svg>
    ),
  },
  {
    href: "/positions",
    label: "Positions",
    description: "Set up roles and tip pool settings",
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M7 9h10M7 13h6M7 17h3" />
      </svg>
    ),
  },
  {
    href: "/schedule",
    label: "Schedule",
    description: "Build and publish the weekly schedule",
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M3 9h18M8 2v4M16 2v4" />
        <path d="M7 13h3M7 17h3M14 13h3M14 17h3" />
      </svg>
    ),
  },
  {
    href: "/ledger",
    label: "Ledger",
    description: "Track petty cash and supplier payments",
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 10h18" />
        <circle cx="7.5" cy="14.5" r="1.25" fill="currentColor" stroke="none" />
        <path d="M12 14.5h6" />
      </svg>
    ),
  },
  {
    href: "/reports",
    label: "Reports",
    description: "View sales, tax, and payroll reports",
    icon: (
      <svg {...iconProps}>
        <path d="M4 20V10M11 20V4M18 20v-7" />
        <path d="M3 20h18" />
      </svg>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    description: "Restaurant-wide configuration",
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 8.6a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 008.91 4.28c.63-.26 1-.87 1-1.51V2.7a2 2 0 014 0v.07c0 .64.37 1.25 1 1.51.63.26 1.35.13 1.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82c.26.63.87 1 1.51 1H21a2 2 0 010 4h-.09c-.64 0-1.25.37-1.51 1z" />
      </svg>
    ),
  },
];

const STAFF_TILES: Tile[] = [
  {
    href: "/me/schedule",
    label: "My Schedule",
    description: "See your upcoming shifts",
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M3 9h18M8 2v4M16 2v4" />
        <path d="M7 13h3M7 17h3M14 13h3M14 17h3" />
      </svg>
    ),
  },
  {
    href: "/me",
    label: "My Pay",
    description: "See your earnings from past shifts",
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 10h18" />
        <circle cx="7.5" cy="14.5" r="1.25" fill="currentColor" stroke="none" />
        <path d="M12 14.5h6" />
      </svg>
    ),
  },
];

function TileLink({ tile }: { tile: Tile }) {
  return (
    <Link
      href={tile.href}
      className="flex flex-col items-start gap-3 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm transition-colors hover:border-neutral-300 hover:bg-neutral-50 active:bg-neutral-100"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700">
        {tile.icon}
      </span>
      <span>
        <span className="block text-base font-semibold text-neutral-900">{tile.label}</span>
        <span className="block text-sm text-neutral-500">{tile.description}</span>
      </span>
    </Link>
  );
}

export default async function Home() {
  const session = await getCurrentStaffSession();
  if (!session) redirect("/login");

  const isManager = session.systemRole === "MANAGER" || session.systemRole === "ADMIN";
  const tiles = isManager ? MANAGER_TILES : STAFF_TILES;

  return (
    <main className="max-w-4xl mx-auto p-6 sm:p-8 font-sans">
      <h1 className="text-2xl font-semibold mb-1">Welcome, {session.name.split(" ")[0]}</h1>
      <p className="text-neutral-500 text-sm mb-6">
        {isManager ? "Pick where you want to work." : "Your schedule and pay, in one place."}
      </p>
      <div
        className={
          isManager
            ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4"
            : "grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl"
        }
      >
        {tiles.map((tile) => (
          <TileLink key={tile.href} tile={tile} />
        ))}
      </div>
    </main>
  );
}
