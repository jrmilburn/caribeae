import CounterPageClient from "./CounterPageClient";
import { getActiveProducts } from "@/server/products/getActiveProducts";
import { getCounterSaleFamily } from "@/server/billing/createCounterInvoice";

export default async function CounterPage() {
  const [products, counterFamily] = await Promise.all([getActiveProducts(), getCounterSaleFamily()]);
  return (
    <div className="h-full overflow-y-auto">
      <CounterPageClient products={products} counterFamily={counterFamily} />
    </div>
  );
}
