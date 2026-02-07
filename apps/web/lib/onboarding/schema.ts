import { z } from "zod";

export const availabilityDayOptions = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const availabilityWindowOptions = ["Morning", "Afternoon", "After school", "Evening"] as const;

export const studentExperienceOptions = [
  "New to swimming",
  "Beginner",
  "Intermediate",
  "Advanced",
] as const;

export const onboardingStudentSchema = z.object({
  firstName: z.string().trim().min(1, "Enter a first name."),
  lastName: z.string().trim().min(1, "Enter a last name."),
  dateOfBirth: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine(
      (value) => {
        if (!value) return true;
        const date = new Date(`${value}T00:00:00.000Z`);
        return !Number.isNaN(date.getTime());
      },
      { message: "Enter a valid date of birth." }
    ),
  experience: z.enum(studentExperienceOptions, {
    message: "Select a current level or experience.",
  }),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const onboardingAvailabilitySchema = z.object({
  preferredDays: z.array(z.enum(availabilityDayOptions)).min(1, "Select at least one day."),
  preferredWindows: z.array(z.enum(availabilityWindowOptions)).min(1, "Select at least one time window."),
  desiredLevelId: z.string().trim().optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

const optionalEmailSchema = z
  .string()
  .trim()
  .optional()
  .nullable()
  .refine((value) => !value || z.string().email().safeParse(value).success, {
    message: "Enter a valid email address.",
  });

const optionalPhoneSchema = z
  .string()
  .trim()
  .optional()
  .nullable()
  .refine((value) => !value || value.length >= 6, {
    message: "Enter a phone number.",
  });

export const onboardingContactSchema = z.object({
  guardianName: z.string().trim().min(1, "Enter the primary guardian's name."),
  email: optionalEmailSchema,
  phone: optionalPhoneSchema,
  secondaryContactName: z.string().trim().max(200).optional().nullable(),
  secondaryEmail: optionalEmailSchema,
  secondaryPhone: optionalPhoneSchema,
  emergencyContactName: z.string().trim().max(200).optional().nullable(),
  emergencyContactPhone: z.string().trim().max(50).optional().nullable(),
  address: z.string().trim().max(400).optional().nullable(),
});

export const onboardingRequestSchema = z.object({
  contact: onboardingContactSchema,
  students: z.array(onboardingStudentSchema).min(1, "Add at least one student."),
  availability: onboardingAvailabilitySchema,
});

export const publicOnboardingRequestSchema = onboardingRequestSchema.extend({
  honeypot: z.string().trim().optional().nullable(),
});

export type OnboardingRequestInput = z.infer<typeof onboardingRequestSchema>;
export type PublicOnboardingRequestInput = z.infer<typeof publicOnboardingRequestSchema>;
export type OnboardingStudentInput = z.infer<typeof onboardingStudentSchema>;
export type OnboardingAvailabilityInput = z.infer<typeof onboardingAvailabilitySchema>;
