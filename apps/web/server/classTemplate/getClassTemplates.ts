
import { prisma } from "@/lib/prisma";

export default async function getClassTemplates() {

    const classTemplates = await prisma.classTemplate.findMany({
        where: {
            active: true,
        },
        orderBy: {
            dayOfWeek: "asc",
        },
        include: {
            level: true,
            teacher: true,
        }
    });

    return classTemplates;

}
