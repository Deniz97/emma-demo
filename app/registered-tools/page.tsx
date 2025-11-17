import { getAllApps } from "@/app/actions/tools";
import { RegisteredToolsClient } from "./registered-tools-client";
import { Navigation } from "@/components/navigation";

export default async function RegisteredToolsPage() {
  const apps = await getAllApps();

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <RegisteredToolsClient initialApps={apps} />
    </div>
  );
}

