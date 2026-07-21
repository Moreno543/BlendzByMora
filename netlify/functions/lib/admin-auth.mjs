/** Verify admin dashboard token from header or JSON body. */
export function verifyAdminToken(request, body = {}) {
  const expected = String(process.env.ADMIN_DASHBOARD_TOKEN ?? '').trim();
  const token = String(request.headers.get('x-admin-token') || body?.token || '').trim();
  return Boolean(expected && token === expected);
}

export const adminCorsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
