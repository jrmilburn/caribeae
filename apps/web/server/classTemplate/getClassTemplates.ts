
import { prisma } from "@/lib/prisma"

export default async function getClassTemplates() {

    const classTemplates = await prisma.classTemplate.findMany({
        orderBy: {
            dayOfWeek: "asc",
        },
        include: {
            level: true
        }
    })

    return classTemplates

}