import { Suspense } from "react"
import { AdminPageContainer } from "@/components/admin/admin-page-container"
import getRecipientDirectory from "@/lib/server/clients/getRecipientDirectory"
import type { ClientRecipient, InvoiceStatus, LevelLite, ClassLite } from "@/types/admin/recipients"
import MessageComposer from "@/app/(app)/admin/messages/MessageComposer"

export async function BroadcastsTab() {
  const data = await getRecipientDirectory()

  if (data.unauthorized) {
    return (
      <AdminPageContainer className="max-w-3xl space-y-4 text-center text-muted-foreground">
        <p>
          You’re not authorised to send messages. If you believe this is an error, please contact an administrator.
        </p>
      </AdminPageContainer>
    )
  }

  const { recipients, levels, classes, invoiceStatusOptions } = data

  return (
    <AdminPageContainer className="max-w-7xl space-y-6 mx-auto">

      <Suspense fallback={<div className="text-muted-foreground">Loading recipients…</div>}>
        <MessageComposer
          recipients={recipients as ClientRecipient[]}
          levels={levels as LevelLite[]}
          classes={classes as ClassLite[]}
          invoiceStatusOptions={invoiceStatusOptions as InvoiceStatus[]}
        />
      </Suspense>
    </AdminPageContainer>
  )
}
