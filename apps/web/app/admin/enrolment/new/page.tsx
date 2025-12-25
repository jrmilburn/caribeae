import { getStudents } from "@/server/student/getStudents";

export default async function NewEnrolmentPage() {

    //List students for selection
    const students = await getStudents();

    if(!students) return <div>Students not found</div>

    //List class options for selection

    //Select start date


}