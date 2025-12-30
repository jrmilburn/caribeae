import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function ExportButtons({
  exportQuery,
  links,
}: {
  exportQuery: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {links.map((link) => (
        <Button key={link.href} asChild variant="outline" size="sm">
          <a href={`${link.href}${exportQuery}`} download>
            <Download className="mr-2 h-4 w-4" />
            {link.label}
          </a>
        </Button>
      ))}
    </div>
  );
}
