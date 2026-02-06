import { Button } from "@/components/ui/button"
import Link from "next/link"

export default function EnrolmentHeader() {

    return (
        <div className="w-full flex justify-between p-4">
            <h3>Enrolments</h3>
            <Button
            >
                <Link
                    href="/admin/enrolment/new"
                >
                    New
                </Link>
            </Button>
        </div>
    )

}