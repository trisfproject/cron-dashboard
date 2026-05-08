const BACKEND_URL = process.env.INTERNAL_API_URL || 'http://backend:3000';
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
]);

function buildProxyHeaders(request) {
  const headers = new Headers(request.headers);
  const cookie = request.headers.get('cookie');

  for (const header of HOP_BY_HOP_HEADERS) {
    headers.delete(header);
  }

  headers.delete('host');

  if (cookie) {
    headers.set('cookie', cookie);
  }

  if (!headers.has('accept')) {
    headers.set('accept', 'application/json');
  }

  if (!headers.has('content-type') && !['GET', 'HEAD'].includes(request.method)) {
    headers.set('content-type', 'application/json');
  }

  return headers;
}

function buildResponseHeaders(response) {
  const headers = new Headers();

  response.headers.forEach((value, key) => {
    const normalized = key.toLowerCase();

    if (!HOP_BY_HOP_HEADERS.has(normalized) && normalized !== 'set-cookie') {
      headers.set(key, value);
    }
  });

  if (typeof response.headers.getSetCookie === 'function') {
    const cookies = response.headers.getSetCookie();

    for (const cookie of cookies) {
      headers.append('set-cookie', cookie);
    }
  } else {
    const cookie = response.headers.get('set-cookie');

    if (cookie) {
      headers.set('set-cookie', cookie);
    }
  }

  return headers;
}

async function proxyRequest(request, params) {
  const path = Array.isArray(params.path) ? params.path.join('/') : '';
  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(`/${path}`, BACKEND_URL);
  targetUrl.search = incomingUrl.search;

  try {
    const requestBody = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text();
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: buildProxyHeaders(request),
      body: requestBody,
      credentials: 'include',
      cache: 'no-store'
    });

    const responseBody = await response.text();
    const responseHeaders = buildResponseHeaders(response);

    return new Response(responseBody, {
      status: response.status,
      headers: responseHeaders
    });
  } catch (error) {
    console.error('frontend api proxy failed', {
      path,
      message: error?.message
    });

    return Response.json(
      { error: 'Backend API unavailable' },
      { status: 502 }
    );
  }
}

export async function GET(request, context) {
  const params = await context.params;
  return proxyRequest(request, params);
}

export async function POST(request, context) {
  const params = await context.params;
  return proxyRequest(request, params);
}

export async function PUT(request, context) {
  const params = await context.params;
  return proxyRequest(request, params);
}

export async function DELETE(request, context) {
  const params = await context.params;
  return proxyRequest(request, params);
}
