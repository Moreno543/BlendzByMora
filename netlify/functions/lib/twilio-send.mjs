/**
 * Twilio outbound SMS — use Messaging Service SID for US A2P 10DLC (campaign-linked).
 * When TWILIO_MESSAGING_SERVICE_SID is set, Messages API uses MessagingServiceSid (Service column populated in logs).
 * Otherwise falls back to From + TWILIO_FROM_NUMBER.
 */
export function twilioMessageParams({ to, body, messagingServiceSid, fromNumber }) {
  const msid = String(messagingServiceSid || '').trim();
  if (msid) {
    return new URLSearchParams({
      To: to,
      MessagingServiceSid: msid,
      Body: body,
    });
  }
  const from = String(fromNumber || '').trim();
  if (!from) {
    throw new Error('Set TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER');
  }
  return new URLSearchParams({
    To: to,
    From: from,
    Body: body,
  });
}

/** True if we can send outbound SMS (Messaging Service and/or From number). */
export function hasOutboundSender(messagingServiceSid, fromNumber) {
  return Boolean(String(messagingServiceSid || '').trim() || String(fromNumber || '').trim());
}
