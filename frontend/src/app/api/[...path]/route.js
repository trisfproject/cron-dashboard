const BACKEND_URL = process.env.INTERNAL_API_URL || 'http://backend:3000';

async function proxyRequest(request, params) {
  const path = Array.isArray(params.path) ? params.path.join('/') : '';
  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(`/${path}`, BACKEND_URL);
  targetUrl.search = incomingUrl.search;

  try {
    const requestBody = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text();
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: {
        accept: request.headers.get('accept') || 'application/json',
        'content-type': request.headers.get('content-type') || 'application/json'
      },
      body: requestBody,
      cache: 'no-store'
    });

    const responseBody = await response.text();
    return new Response(responseBody, {
      status: response.status,
      headers: {
        'content-type': response.headers.get('content-type') || 'application/json'
      }
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
