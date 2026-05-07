function getApiBaseUrl() {
  if (typeof window !== 'undefined') {
    return '/api';
  }

  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  const fallbackUrl = 'http://127.0.0.1:3000';

  try {
    const appUrl = new URL(configuredUrl || fallbackUrl);
    return `${appUrl.origin}/api`;
  } catch {
    return `${fallbackUrl}/api`;
  }
}

async function request(path) {
  let response;

  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      cache: 'no-store'
    });
  } catch (error) {
    throw new Error(`API request failed: ${error?.message || 'Unable to reach frontend API proxy'}`);
  }

  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body?.error ? `: ${body.error}` : '';
    } catch {
      detail = '';
    }

    throw new Error(`API request failed: ${response.status} ${response.statusText}${detail}`);
  }

  return response.json();
}

export function getStats(params = {}) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }

  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request(`/stats${suffix}`);
}

export function getCronList() {
  return request('/cron-list');
}

export function getLogs(params = {}) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }

  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request(`/logs${suffix}`);
}
