import { getAllApps } from "@/app/actions/tools";
import { ClassesClient } from "./classes-client";
import { Navigation } from "@/components/navigation";

export default async function ClassesPage() {
  const apps = await getAllApps();

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <ClassesClient initialApps={apps} />
    </div>
  );
}

