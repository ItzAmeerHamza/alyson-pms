export const config = {
  runtime: 'nodejs',
};

function getSupabaseBaseUrl() {
  const url =
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    '';

  if (!url) {
    throw new Error('Missing SUPABASE_URL / VITE_SUPABASE_URL in Vercel env.');
  }

  return url.replace(/\/+$/, '');
}

export default async function handler(req: any, res: any) {
  try {
    const baseUrl = getSupabaseBaseUrl();
    const pathParts = Array.isArray(req.query?.path) ? req.query.path : [req.query?.path].filter(Boolean);
    const targetPath = '/' + pathParts.join('/');

    const queryIndex = (req.url || '').indexOf('?');
    const qs = queryIndex >= 0 ? (req.url || '').slice(queryIndex) : '';
    const targetUrl = `${baseUrl}${targetPath}${qs}`;

    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers || {})) {
      if (!v) continue;
      if (Array.isArray(v)) headers[k] = v.join(',');
      else headers[k] = String(v);
    }

    // Avoid sending host header of the proxy domain
    delete headers.host;

    const method = (req.method || 'GET').toUpperCase();
    const body =
      method === 'GET' || method === 'HEAD'
        ? undefined
        : (typeof req.body === 'string' || Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body ?? {}));

    const upstream = await fetch(targetUrl, {
      method,
      headers,
      body,
    });

    res.status(upstream.status);

    upstream.headers.forEach((value, key) => {
      // Vercel will manage transfer-encoding; set-cookie should pass through for auth flows.
      if (key.toLowerCase() === 'transfer-encoding') return;
      res.setHeader(key, value);
    });

    const buf = Buffer.from(await upstream.arrayBuffer());
    res.send(buf);
  } catch (err: any) {
    res.status(500).json({
      error: 'supabase_proxy_error',
      message: err?.message || String(err),
    });
  }
}

