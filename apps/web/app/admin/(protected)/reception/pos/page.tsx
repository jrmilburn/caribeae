import { getPosCatalog } from "@/server/products/getPosCatalog";
import PosPageClient from "./PosPageClient";

export default async function PosPage() {
  const categories = await getPosCatalog();

  return (
    <div className="h-full overflow-y-auto">
      <PosPageClient categories={categories} />
    </div>
  );
}
