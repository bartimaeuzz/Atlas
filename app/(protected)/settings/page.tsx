import { loadRestaurantSettings } from "@/lib/settings/loadRestaurantSettings";
import { SettingsForm } from "./SettingsForm";

export default async function SettingsPage() {
  const settings = await loadRestaurantSettings();

  return (
    <main className="max-w-2xl mx-auto p-8 font-sans">
      <h1 className="text-2xl font-semibold mb-1">Settings</h1>
      <p className="text-neutral-500 text-sm mb-6">Restaurant-wide configuration for tips, pools, and roster visibility.</p>
      <SettingsForm settings={settings} />
    </main>
  );
}
