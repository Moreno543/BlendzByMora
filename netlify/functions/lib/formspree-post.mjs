/**
 * Server-side Formspree submissions — match browser booking posts to reduce Formshield false positives.
 */

const SITE_ORIGIN = 'https://blendzbymora.com';

export async function postFormspreeJson(formspreeId, fields) {
  if (!formspreeId) return { ok: false, skipped: true, reason: 'missing_form_id' };

  const body = {
    _gotcha: '',
    ...fields,
  };

  const res = await fetch(`https://formspree.io/f/${formspreeId}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Origin: SITE_ORIGIN,
      Referer: `${SITE_ORIGIN}/book.html`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error('[formspree-post] Formspree failed', res.status, errText);
    return { ok: false, error: 'Formspree failed', status: res.status };
  }

  return { ok: true, sent: true };
}
