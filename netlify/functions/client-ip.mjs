/**
 * Returns the caller's public IP as seen by Netlify (for booking abuse notes).
 * GET /.netlify/functions/client-ip → { "ip": "203.0.113.1" }
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function clientIpFromRequest(request) {
  const nf = request.headers.get('x-nf-client-connection-ip');
  if (nf && nf.trim()) return nf.trim().split(',')[0].trim();
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const rip = request.headers.get('x-real-ip');
  if (rip && rip.trim()) return rip.trim();
  return '';
}

function sanitizeIp(raw) {
  const s = String(raw || '').trim();
  if (!s || s.length > 45) return '';
  if (!/^[\d.a-fA-F:]+$/i.test(s)) return '';
  return s;
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const ip = sanitizeIp(clientIpFromRequest(request));
  return new Response(JSON.stringify({ ip }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
