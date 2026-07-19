/**
 * Verify Square webhook x-square-hmacsha256-signature header.
 * Signed string = notificationUrl + rawBody (no separator).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifySquareWebhookSignature({
  signatureHeader,
  rawBody,
  signatureKey,
  notificationUrl,
}) {
  if (!signatureHeader || !signatureKey || !notificationUrl || rawBody == null) {
    return false;
  }

  const payload = String(notificationUrl) + String(rawBody);
  const expected = createHmac('sha256', signatureKey).update(payload, 'utf8').digest('base64');

  try {
    const a = Buffer.from(signatureHeader, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Try configured URL plus www / non-www variant. */
export function candidateNotificationUrls(request, configuredUrl) {
  const urls = new Set();
  if (configuredUrl) urls.add(configuredUrl.trim());

  try {
    const u = new URL(request.url);
    const proto = request.headers.get('x-forwarded-proto') || u.protocol.replace(':', '') || 'https';
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || u.host;
    urls.add(`${proto}://${host}${u.pathname}`);
  } catch (_) {}

  const expanded = [...urls];
  for (const url of expanded) {
    try {
      const u = new URL(url);
      const h = u.hostname;
      if (h.startsWith('www.')) {
        u.hostname = h.slice(4);
      } else {
        u.hostname = `www.${h}`;
      }
      urls.add(u.toString());
    } catch (_) {}
  }

  return [...urls];
}

export function isValidSquareWebhookSignature(opts) {
  const urls = candidateNotificationUrls(opts.request, opts.configuredNotificationUrl);
  return urls.some((notificationUrl) =>
    verifySquareWebhookSignature({
      signatureHeader: opts.signatureHeader,
      rawBody: opts.rawBody,
      signatureKey: opts.signatureKey,
      notificationUrl,
    })
  );
}
