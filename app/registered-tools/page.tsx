import { getAllApps } from "@/app/actions/tools";
import { RegisteredToolsClient } from "./registered-tools-client";

export default async function RegisteredToolsPage() {
  const apps = await getAllApps();

  return (
    <div className="min-h-screen flex flex-col">
      <RegisteredToolsClient initialApps={apps} />
    </div>
  );
}

