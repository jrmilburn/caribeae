
import EnrolmentNewForm from "./EnrolmentNewForm";
import { getEnrolmentNewPageData } from "@/server/enrolment/getEnrolmentNewPageData";

type PageProps = {
  searchParams?: {
    studentId?: string;
    templateId?: string;
    startDate?: string;
  };
};

export default async function NewEnrolmentPage({ searchParams }: PageProps) {
  const studentId = searchParams?.studentId;
  const templateId = searchParams?.templateId;

  if (!studentId || !templateId) return null;

  const data = await getEnrolmentNewPageData({
    studentId,
    templateId,
    startDate: searchParams?.startDate,
  });

  if (!data) return null;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 py-4">
      <div className="space-y-1 px-4">
        <h1 className="text-xl font-semibold">New enrolment</h1>
        <p className="text-sm text-muted-foreground">
          Confirm the enrolment details and reserve upcoming class spots.
        </p>
      </div>

      <EnrolmentNewForm data={data} />
    </div>
  );
}
