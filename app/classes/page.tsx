import { getAllApps } from "@/app/actions/tools";
import { ClassesClient } from "./classes-client";

export default async function ClassesPage() {
  const apps = await getAllApps();

  return (
    <div className="min-h-screen flex flex-col">
      <ClassesClient initialApps={apps} />
    </div>
  );
}

