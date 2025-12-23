import EnrolmentList from "./EnrolmentList";
import { getEnrolmentsListData } from "@/server/enrolment/getEnrolmentsListData";

import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

export default async function AdminEnrolmentsPage() {
  await getOrCreateUser();
  await requireAdmin();

  const enrolments = await getEnrolmentsListData();

  return (
    <div className="max-h-screen overflow-y-auto">
      <EnrolmentList enrolments={enrolments} />
    </div>
  );
}
