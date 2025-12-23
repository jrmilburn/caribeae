import getClassTemplates from "@/server/classTemplate/getClassTemplates";

import TemplateList from "./TemplateList";
import { getLevels } from "@/server/level/getLevels";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

export default async function ClassTemplates() {

    await getOrCreateUser()
    await requireAdmin()

    const templates = await getClassTemplates();
    const levels = await getLevels();

    return (
        <div>
            <TemplateList 
                templates={templates}
                levels={levels}
            />
        </div>
    )

}