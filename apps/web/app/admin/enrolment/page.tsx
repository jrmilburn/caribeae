import { getEnrolments } from "@/server/enrolment/getEnrolments";
import EnrolmentList from "./EnrolmentList";

import EnrolmentHeader from "./EnrolmentHeader";


export default async function EnrolmentPage() {

    //
    const enrolments = await getEnrolments();

    return (
        <>
        <EnrolmentHeader />
        <EnrolmentList 
            enrolments={enrolments}
        />
        </>
    )

}