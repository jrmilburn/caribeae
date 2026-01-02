"use server";

import { getFamilyBillingPosition, type FamilyBillingPosition } from "./getFamilyBillingPosition";

export async function getFamilyBillingSummary(familyId: string) {
  return getFamilyBillingPosition(familyId);
}

export type FamilyBillingSummary = FamilyBillingPosition;
