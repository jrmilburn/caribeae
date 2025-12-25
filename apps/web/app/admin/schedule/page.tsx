import { getLevels } from "@/server/level/getLevels"
import { requireAdmin } from "@/lib/requireAdmin";
import ScheduleWithTemplateModal from "./ScheduleWithTemplateModal";

export default async function AdminSchedule() {

    await requireAdmin();

    const levels = await getLevels();

    return(
        <ScheduleWithTemplateModal levels={levels} />
    )

}
