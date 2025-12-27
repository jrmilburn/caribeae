import twilio from "twilio";

export function twilioValidateRequest(signature: string, url: string, rawBody: string) {
  if (!process.env.TWILIO_AUTH_TOKEN) return false;
  return twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN, signature, url, rawBody);
}
