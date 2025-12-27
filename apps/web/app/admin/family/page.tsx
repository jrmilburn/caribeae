import { getFamilies } from "@/server/family/getFamilies"
import { getUnpaidFamiliesSummary, maybeRunInvoicingSweep } from "@/server/invoicing";

import FamilyList from "./FamilyList";

export default async function FamilyPage() {

    await maybeRunInvoicingSweep();
    const [summary, families] = await Promise.all([
      getUnpaidFamiliesSummary(),
      getFamilies(),
    ]);

    return (
        <div className="">
        <FamilyList 
            families={families}
            unpaidSummary={summary}
        />
        </div>
    )

}
