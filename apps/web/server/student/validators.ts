import { z } from "zod";

const studentSchema = z.object({
  name: z.string().min(1),
  dateOfBirth: z.string().optional().nullable(),
  medicalNotes: z.string().optional().nullable(),
  familyId: z.string().min(1),
  levelId: z.string().min(1),
});

export function parseStudentPayload(input: unknown) {
  const payload = studentSchema.parse(input);

  const name = payload.name.trim();
  const familyId = payload.familyId.trim();
  const levelId = payload.levelId.trim();

  if (!name) throw new Error("Student name is required.");
  if (!familyId) throw new Error("Family is required.");
  if (!levelId) throw new Error("Level is required.");

  const dobRaw = payload.dateOfBirth?.trim() || null;
  let dateOfBirth: Date | null = null;

  if (dobRaw) {
    const parsed = new Date(`${dobRaw}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error("Enter a valid date of birth.");
    }
    dateOfBirth = parsed;
  }

  return {
    ...payload,
    name,
    familyId,
    levelId,
    dateOfBirth,
    medicalNotes: payload.medicalNotes?.trim() || null,
  };
}
