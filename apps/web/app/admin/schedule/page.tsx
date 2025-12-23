import { ScheduleView } from "@/packages/schedule"
import { getLevels } from "@/server/level/getLevels"
import { requireAdmin } from "@/lib/requireAdmin";

export default async function AdminSchedule() {

    await requireAdmin();

    const levels = await getLevels();

    return(
        <ScheduleView
            levels={levels}
        />
    )

}