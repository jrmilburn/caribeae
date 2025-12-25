import { Enrolment } from "@prisma/client";
import EnrolmentListItem from "./EnrolmentListItem";

export default async function EnrolmentList({ enrolments } : { enrolments : Enrolment[] }) {

    return (
        <div>
            {enrolments.length === 0 && (
                <div>No enrolments found</div>
            )}
            {enrolments.map((enrolment) => (
                <EnrolmentListItem 
                    key={enrolment.id}
                    enrolment={enrolment}
                />
            ))}
        </div>
    )

}