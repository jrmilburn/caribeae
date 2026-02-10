import { BrandedError } from "@/components/errors/BrandedError";

export default function NotFound() {
  return <BrandedError variant="not-found" />;
}
