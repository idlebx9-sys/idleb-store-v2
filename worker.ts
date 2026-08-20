interface Env {
  STORE_DATA: KVNamespace;
  ASSETS: Fetcher;
  ADMIN_API_KEY?: string;
  ALOFOQ_API_TOKEN?: string;
}

const STORE_KEY = 'catalog-v1';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
      'access-control-allow-headers': 'Content-Type,X-Admin-Key',
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const expected = env.ADMIN_API_KEY || 'IDLEB@2026';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
        'access-control-allow-headers': 'Content-Type,X-Admin-Key',
        'access-control-max-age': '86400'
      }});
    }

    // Secure server-side proxy for the supplier API. The token never reaches the browser.
    if (url.pathname.startsWith('/api/alofoq/')) {
      if (!env.ALOFOQ_API_TOKEN) return json({ error: 'ALOFOQ_API_TOKEN is not configured' }, 500);
      const upstreamPath = url.pathname.slice('/api/alofoq'.length);
      if (!['/profile', '/products', '/order', '/check'].includes(upstreamPath)) return json({ error: 'Unknown supplier endpoint' }, 404);
      let upstreamUrl: URL;
      if (upstreamPath === '/order') {
        if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
        const body = await request.json().catch(() => null) as any;
        if (!body || !body.productId || !body.order_uuid) return json({ error: 'productId and order_uuid are required' }, 400);
        upstreamUrl = new URL(`https://api.alofoqtech.com/client/api/newOrder/${encodeURIComponent(String(body.productId))}/params`);
        upstreamUrl.searchParams.set('qty', String(body.qty ?? 1));
        upstreamUrl.searchParams.set('order_uuid', String(body.order_uuid));
        for (const [key, value] of Object.entries(body.params || {})) if (value !== undefined && value !== null && String(value).trim() !== '') upstreamUrl.searchParams.set(key, String(value));
      } else {
        upstreamUrl = new URL(`https://api.alofoqtech.com/client/api${upstreamPath}`);
        for (const [key, value] of url.searchParams.entries()) upstreamUrl.searchParams.append(key, value);
      }
      try {
        const response = await fetch(upstreamUrl.toString(), { headers: { 'api-token': env.ALOFOQ_API_TOKEN, 'accept': 'application/json' } });
        const text = await response.text();
        return new Response(text, { status: response.status, headers: { 'content-type': response.headers.get('content-type') || 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' } });
      } catch { return json({ error: 'Supplier API unavailable' }, 502); }
    }

    // Global collections used by the frontend. They intentionally share KV so all devices see the same data.
    if (url.pathname.startsWith('/api/data/')) {
      const name = decodeURIComponent(url.pathname.slice('/api/data/'.length));
      if (!/^(users|topups|complaints|orders)$/.test(name)) return json({ error: 'Unknown collection' }, 404);
      const key = `global:${name}:v1`;
      if (request.method === 'GET') {
        const value = await env.STORE_DATA.get(key, 'json');
        return json({ items: Array.isArray(value) ? value : [] });
      }
      if (request.method === 'POST' || request.method === 'PUT') {
        const body = await request.json().catch(() => null) as any;
        if (!body || !Array.isArray(body.items)) return json({ error: 'Invalid collection payload' }, 400);
        await env.STORE_DATA.put(key, JSON.stringify(body.items));
        return json({ ok: true, items: body.items });
      }
      return json({ error: 'Method not allowed' }, 405);
    }

    if (url.pathname === '/api/store') {
      if (request.method === 'GET') {
        const value = await env.STORE_DATA.get(STORE_KEY, 'json');
        if (!value) return json({ error: 'Store not initialized' }, 404);
        return json(value);
      }
      if (request.method === 'PUT') {
        if (request.headers.get('X-Admin-Key') !== expected) return json({ error: 'Unauthorized' }, 401);
        const body = await request.json().catch(() => null) as any;
        if (!body || !Array.isArray(body.categories) || !Array.isArray(body.products) || !body.settings || typeof body.settings !== 'object') return json({ error: 'Invalid store payload' }, 400);
        const clean = { categories: body.categories, products: body.products, settings: body.settings };
        await env.STORE_DATA.put(STORE_KEY, JSON.stringify(clean));
        return json({ ok: true, store: clean });
      }
      return json({ error: 'Method not allowed' }, 405);
    }

    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) return assetResponse;
    const accept = request.headers.get('Accept') || '';
    if (request.method === 'GET' && accept.includes('text/html')) {
      const indexUrl = new URL('/index.html', request.url);
      return env.ASSETS.fetch(new Request(indexUrl.toString(), request));
    }
    return assetResponse;
  },
};
