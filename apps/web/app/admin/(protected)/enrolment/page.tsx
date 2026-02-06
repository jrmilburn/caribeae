import { getEnrolments } from "@/server/enrolment/getEnrolments";
import EnrolmentList from "./EnrolmentList";

export default async function EnrolmentPage() {

    //
    const enrolments = await getEnrolments();

    return (
        <>
        <EnrolmentList 
            enrolments={enrolments}
        />
        </>
    )

}