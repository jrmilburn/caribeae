import EnrolmentStartForm from "./EnrolmentStartForm";

import { getEnrolmentStartPageData } from "@/server/enrolment/getEnrolmentStartPageData";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

export default async function EnrolmentStartPage() {
  await getOrCreateUser();
  await requireAdmin();

  const data = await getEnrolmentStartPageData();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 py-6">
      <div className="space-y-1 px-4">
        <h1 className="text-xl font-semibold">New enrolment</h1>
        <p className="text-sm text-muted-foreground">
          Select a student and class template to start a new enrolment.
        </p>
      </div>

      <EnrolmentStartForm data={data} />
    </div>
  );
}
