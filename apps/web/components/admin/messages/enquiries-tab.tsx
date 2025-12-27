import getEnquiries from "@/lib/server/enquiries/getEnquiries"
import createEnquiryAdmin from "@/lib/server/enquiries/createEnquiryAdmin"
import updateEnquiryAdmin from "@/lib/server/enquiries/updateEnquiryAdmin"
import deleteEnquiry from "@/lib/server/enquiries/deleteEnquiry"
import EnquiriesTableClient from "@/components/ui/datatable/enquiries/enquiriesTableClient"

export async function EnquiriesTab() {
  const raw = (await getEnquiries()) ?? []

  type TableProps = React.ComponentProps<typeof EnquiriesTableClient>
  type Row = TableProps["data"][number]

  const toIso = (v: Date | string): string => (typeof v === "string" ? v : v.toISOString())

  const data: Row[] = raw.map((e) => {
    const preferredContact = (e.preferredContact ?? undefined) as Row["preferredContact"]
    const students = (Array.isArray(e.students) ? e.students : []) as Row["students"]

    return {
      ...e,
      email: e.email ?? "",
      phone: e.phone ?? "",
      preferredContact,
      students,
      createdAt: toIso(e.createdAt),
      updatedAt: toIso(e.updatedAt),
    }
  })

  const createAction: (fd: FormData) => Promise<void> = async (fd) => {
    "use server"
    await createEnquiryAdmin(fd)
  }
  const updateAction: (id: string, fd: FormData) => Promise<void> = async (id, fd) => {
    "use server"
    await updateEnquiryAdmin(id, fd)
  }
  const deleteAction: (id: string) => Promise<void> = async (id) => {
    "use server"
    await deleteEnquiry(id)
  }

  const formFields = [
    { name: "name", label: "Name", type: "text" as const, required: true },
    { name: "email", label: "Email", type: "email" as const },
    { name: "phone", label: "Phone", type: "text" as const },
    {
      name: "preferredContact",
      label: "Preferred Contact",
      type: "select" as const,
      options: [
        { value: "NONE", label: "No preference" },
        { value: "EMAIL", label: "Email" },
        { value: "PHONE", label: "Phone" },
      ],
    },
    {
      name: "status",
      label: "Status",
      type: "select" as const,
      required: true,
      options: [
        { value: "NEW", label: "New" },
        { value: "IN_PROGRESS", label: "In progress" },
        { value: "RESOLVED", label: "Resolved" },
        { value: "CLOSED", label: "Closed" },
      ],
    },
    { name: "message", label: "Message", type: "textarea" as const, required: true, placeholder: "Client’s message..." },
  ]

  return (
    <div className="w-full mx-auto max-w-7xl">
      <EnquiriesTableClient
        data={data}
        formFields={formFields}
        filterPlaceholder="Filter..."
        onCreateAction={createAction}
        onUpdateAction={updateAction}
        onDeleteAction={deleteAction}
      />
    </div>
  )
}
