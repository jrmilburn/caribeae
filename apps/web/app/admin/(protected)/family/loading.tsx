import { TableLoading } from "@/components/loading/LoadingSystem";

export default function Loading() {
  return <TableLoading columns={5} rows={12} contentMaxWidthClassName="max-w-7xl" />;
}
