/**
 * Email verification via Reoon (single-verify API).
 * Uses POWER mode by default so individual inboxes (e.g. Gmail) are checked — QUICK mode does not.
 *
 * POST JSON: { email: "user@domain.com" }
 * Env: REOON_API_KEY — from Reoon dashboard → API & Integrations
 * Optional: REOON_VERIFY_MODE=quick (faster, weaker — not recommended for booking)
 * Optional: EMAIL_VALIDATION_DISABLED=true
 *
 * Docs: https://www.reoon.com/articles/api-documentation-of-reoon-email-verifier/
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function resolveMode() {
  const m = String(process.env.REOON_VERIFY_MODE || 'power').trim().toLowerCase();
  return m === 'quick' ? 'quick' : 'power';
}

/** Map Reoon JSON to allow / deny booking. */
function reoonDecision(data, mode) {
  if (!data || typeof data !== 'object') {
    return { ok: false, message: 'Could not verify email right now. Please try again.' };
  }

  if (String(data.status || '').toLowerCase() === 'error') {
    const reason = typeof data.reason === 'string' ? data.reason : '';
    console.warn('[verify-email] Reoon error:', reason || data);
    if (/credit|balance|limit|quota|exhausted/i.test(reason)) {
      return {
        ok: false,
        message: 'Email verification credits are used up. Please try again later or contact us to book.',
      };
    }
    return {
      ok: false,
      message: 'Could not verify email right now. Please try again.',
    };
  }

  const st = String(data.status || '').toLowerCase();

  if (mode === 'quick') {
    if (st === 'invalid') {
      return {
        ok: false,
        message:
          'That email address doesn’t exist or can’t receive messages. Double-check it and try again.',
      };
    }
    if (st === 'disposable' || st === 'spamtrap') {
      return {
        ok: false,
        message: 'Please use a personal or work email, not a disposable address.',
      };
    }
    if (st === 'valid') {
      return { ok: true };
    }
    return { ok: true };
  }

  // power
  const rejectMessages = {
    invalid:
      'That email address doesn’t exist or can’t receive messages. Double-check it and try again.',
    disabled: 'That email address appears disabled or inactive. Try a different address.',
    disposable: 'Please use a personal or work email, not a disposable inbox.',
    spamtrap: 'This email can’t be used. Try a different address.',
    inbox_full: 'That inbox may be full. Try another email or free space and submit again.',
  };

  if (Object.prototype.hasOwnProperty.call(rejectMessages, st)) {
    return { ok: false, message: rejectMessages[st] };
  }

  if (st === 'safe') {
    return { ok: true };
  }

  if (st === 'unknown' || st === 'catch_all' || st === 'role_account') {
    return { ok: true };
  }

  if (data.is_safe_to_send === true || data.is_deliverable === true) {
    return { ok: true };
  }

  if (data.is_deliverable === false && st && !['unknown', 'catch_all', 'role_account'].includes(st)) {
    return {
      ok: false,
      message:
        'That email address doesn’t exist or can’t receive messages. Double-check it and try again.',
    };
  }

  return { ok: true };
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  if (String(process.env.EMAIL_VALIDATION_DISABLED || '').toLowerCase() === 'true') {
    return json({ ok: true, skipped: true });
  }

  const apiKey = String(process.env.REOON_API_KEY || '').trim();
  if (!apiKey) {
    return json({ ok: true, skipped: true });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, message: 'Invalid request.' }, 400);
  }

  const email = String(body?.email || '')
    .trim()
    .toLowerCase();
  if (!email || email.length > 254 || !email.includes('@')) {
    return json({ ok: false, message: 'Enter a valid email address.' }, 400);
  }

  const mode = resolveMode();
  const verifyUrl = new URL('https://emailverifier.reoon.com/api/v1/verify');
  verifyUrl.searchParams.set('email', email);
  verifyUrl.searchParams.set('key', apiKey);
  verifyUrl.searchParams.set('mode', mode);

  let res;
  let data = {};
  try {
    res = await fetch(verifyUrl.toString(), { method: 'GET' });
    data = await res.json().catch(() => ({}));
  } catch (err) {
    console.error('[verify-email] fetch error:', err);
    return json(
      {
        ok: false,
        message: 'Could not verify email right now. Please try again in a moment.',
      },
      200
    );
  }

  if (res.status === 429) {
    return json(
      {
        ok: false,
        message: 'Email verification is busy. Please try again in a minute.',
      },
      200
    );
  }

  if (!res.ok) {
    console.warn('[verify-email] Reoon HTTP', res.status, data);
    return json(
      {
        ok: false,
        message: 'Could not verify email right now. Please try again.',
      },
      200
    );
  }

  const decision = reoonDecision(data, mode);
  if (!decision.ok) {
    return json({ ok: false, message: decision.message });
  }

  return json({ ok: true });
}
