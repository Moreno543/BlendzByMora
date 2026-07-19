/**
 * GET-only health check for Square webhook env (no secrets exposed).
 */
function env(name) {
  return String(process.env[name] ?? '').trim();
}

export default async function handler(request) {
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const notificationUrl = env('SQUARE_WEBHOOK_NOTIFICATION_URL');

  return new Response(
    JSON.stringify({
      ok: true,
      hasSignatureKey: Boolean(env('SQUARE_WEBHOOK_SIGNATURE_KEY')),
      hasNotificationUrl: Boolean(notificationUrl),
      notificationUrl: notificationUrl || null,
      hasSupabase: Boolean(env('SUPABASE_URL') && env('SUPABASE_SERVICE_ROLE_KEY')),
      hasFormspree: Boolean(env('FORMSPREE_BOOKING_ID')),
      hasSquareApi: Boolean(env('SQUARE_ACCESS_TOKEN')),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
