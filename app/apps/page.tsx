import { getAllApps } from "@/app/actions/tools";
import { AppsClient } from "./apps-client";
import { Navigation } from "@/components/navigation";

export default async function AppsPage() {
  const apps = await getAllApps();

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <AppsClient initialApps={apps} />
    </div>
  );
}

