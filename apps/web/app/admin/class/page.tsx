import { getLevels } from "@/server/level/getLevels";
import getClassInstancesRaw from "@/server/classInstance/getClassInstancesRaw";

import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

import ClassList from "./ClassList";

export default async function AdminClassesPage() {
  await getOrCreateUser();
  await requireAdmin();

  const instances = await getClassInstancesRaw();
  const levels = await getLevels();

  return (
    <div className="max-h-screen overflow-y-auto">
      <ClassList instances={instances} levels={levels} />
    </div>
  );
}
