import { getProductSettingsData } from "@/server/products/getProductSettingsData";
import { ProductsSection } from "./ProductsSection";

export default async function ProductsPage() {
  const categories = await getProductSettingsData();

  return <ProductsSection categories={categories} />;
}
