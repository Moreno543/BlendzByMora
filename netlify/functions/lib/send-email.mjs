/**
 * Send plain-text email directly (Gmail app password).
 * Used for clean customer refund confirmations — not Formspree CC dumps.
 */
import nodemailer from 'nodemailer';

function env(name) {
  return String(process.env[name] ?? '').trim();
}

let transporterPromise = null;

function getTransporter() {
  const pass = env('GMAIL_APP_PASSWORD');
  if (!pass) return null;

  if (!transporterPromise) {
    const user = env('GMAIL_USER') || 'BlendzByMora@gmail.com';
    transporterPromise = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });
  }
  return transporterPromise;
}

export function hasDirectEmailConfigured() {
  return Boolean(env('GMAIL_APP_PASSWORD'));
}

/** @param {{ to: string, subject: string, text: string }} opts */
export async function sendDirectEmail({ to, subject, text }) {
  const recipient = String(to || '').trim();
  if (!recipient) return { ok: false, skipped: true, reason: 'missing_to' };

  const transporter = getTransporter();
  if (!transporter) {
    return { ok: false, skipped: true, reason: 'missing_gmail' };
  }

  const from = env('GMAIL_USER') || 'BlendzByMora@gmail.com';

  try {
    await transporter.sendMail({
      from: `"Blendz By Mora" <${from}>`,
      to: recipient,
      subject: String(subject || '').trim() || 'Blendz By Mora',
      text: String(text || ''),
    });
    return { ok: true, sent: true };
  } catch (err) {
    console.error('[send-email] failed', err);
    return { ok: false, error: err instanceof Error ? err.message : 'send failed' };
  }
}
