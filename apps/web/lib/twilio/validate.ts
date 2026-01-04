/* eslint-disable @typescript-eslint/no-explicit-any */
import twilio from "twilio";

export function twilioValidateRequest(
  signature: string,
  url: string,

  params: Record<string, any>
) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return false;

  return twilio.validateRequest(token, signature, url, params);
}
