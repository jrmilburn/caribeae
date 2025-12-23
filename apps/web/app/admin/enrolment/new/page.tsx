import EnrolmentNewForm from "./EnrolmentNewForm";
import { getEnrolmentNewPageData } from "@/server/enrolment/getEnrolmentNewPageData";

type SearchParams = {
  studentId?: string;
  templateId?: string;
  startDate?: string;
};

type PageProps = {
  searchParams?: SearchParams | Promise<SearchParams>;
};

export default async function NewEnrolmentPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {};

  const studentId = sp.studentId;
  const templateId = sp.templateId;
  const startDate = sp.startDate;

  if (!studentId || !templateId) return null;

  const data = await getEnrolmentNewPageData({
    studentId,
    templateId,
    startDate,
  });

  console.l

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
