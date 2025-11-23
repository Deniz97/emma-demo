import { getAllApps } from "@/app/actions/tools";
import { AppsClient } from "./apps-client";

export default async function AppsPage() {
  const apps = await getAllApps();

  return (
    <div className="min-h-screen flex flex-col">
      <AppsClient initialApps={apps} />
    </div>
  );
}
