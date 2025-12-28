import { listCommunications } from "@/server/communication/listCommunications";
import { CommunicationsTable } from "./CommunicationsTable";

export default async function CommunicationsPage() {
  const communications = await listCommunications();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b bg-card px-4 py-3">
        <h1 className="text-base font-semibold">Communications</h1>
        <p className="text-xs text-muted-foreground">
          Recent emails and messages that have been sent.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <CommunicationsTable communications={communications} />
      </div>
    </div>
  );
}
