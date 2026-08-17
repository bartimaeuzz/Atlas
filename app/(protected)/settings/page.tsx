import { loadRestaurantSettings, loadRecoveryCodeStatus } from "@/lib/settings/loadRestaurantSettings";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { SettingsForm } from "./SettingsForm";
import { RecoveryCodeSection } from "./RecoveryCodeSection";

export default async function SettingsPage() {
  const [settings, recoveryStatus, session] = await Promise.all([
    loadRestaurantSettings(),
    loadRecoveryCodeStatus(),
    getCurrentStaffSession(),
  ]);
  const viewerIsAdmin = session?.systemRole === "ADMIN";

  return (
    <main className="max-w-2xl mx-auto p-8 font-sans">
      <h1 className="text-2xl font-semibold mb-1">Settings</h1>
      <p className="text-neutral-500 text-sm mb-6">Restaurant-wide configuration for tips, pools, and roster visibility.</p>
      {viewerIsAdmin && (
        <div className="mb-8">
          <RecoveryCodeSection status={recoveryStatus} viewerIsAdmin={viewerIsAdmin} />
        </div>
      )}
      <SettingsForm settings={settings} />
    </main>
  );
}
