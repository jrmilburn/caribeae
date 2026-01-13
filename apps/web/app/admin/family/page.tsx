import { getFamilies } from "@/server/family/getFamilies"
import { getLevels } from "@/server/level/getLevels";

import FamilyList from "./FamilyList";

export default async function FamilyPage() {
    const [families, levels] = await Promise.all([
      getFamilies(),
      getLevels(),
    ]);

    return (
        <div className="">
        <FamilyList 
            families={families}
            levels={levels}
        />
        </div>
    )

}
