import { getFamilies } from "@/server/family/getFamilies"
import { maybeRunInvoicingSweep } from "@/server/invoicing";

import FamilyList from "./FamilyList";

export default async function FamilyPage() {

    await maybeRunInvoicingSweep();
    const [families] = await Promise.all([
      getFamilies(),
    ]);

    return (
        <div className="">
        <FamilyList 
            families={families}
        />
        </div>
    )

}
