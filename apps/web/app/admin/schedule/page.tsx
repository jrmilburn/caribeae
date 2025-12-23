import { ScheduleView, createApiScheduleDataAdapter } from "@/packages/schedule"
import { getLevels } from "@/server/level/getLevels"
import { requireAdmin } from "@/lib/requireAdmin";
import { moveClassInstanceAction } from "./actions";

export default async function AdminSchedule() {

    await requireAdmin();

    const levels = await getLevels();

    return(
        <ScheduleView
            levels={levels}
            dataEndpoint="/api/admin/class-instances"
            moveClassInstanceAction={moveClassInstanceAction}
        />
    )

}
