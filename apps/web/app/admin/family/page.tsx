import { getFamilies } from "@/server/family/getFamilies"

import FamilyList from "./FamilyList";

export default async function FamilyPage() {

    const families = await getFamilies();

    return (
        <div className="">
        <FamilyList 
            families={families}
        />
        </div>
    )

}