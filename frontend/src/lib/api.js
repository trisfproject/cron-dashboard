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

async function request(path, options = {}) {
  let response;

  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      cache: 'no-store',
      ...options,
      headers: {
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...(options.headers || {})
      }
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

export function getCronList(params = {}) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }

  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request(`/cron-list${suffix}`);
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

export function getAlerts(params = {}) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }

  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request(`/alerts${suffix}`);
}

export function evaluateAlerts() {
  return request('/alerts/evaluate', {
    method: 'POST',
    body: JSON.stringify({})
  });
}

export function sendTestTelegramNotification() {
  return request('/alerts/test-telegram', {
    method: 'POST',
    body: JSON.stringify({})
  });
}

export function acknowledgeAlert(id) {
  return request(`/alerts/${id}/acknowledge`, {
    method: 'POST',
    body: JSON.stringify({})
  });
}

export function getAlertRules() {
  return request('/alert-rules');
}

export function createAlertRule(rule) {
  return request('/alert-rules', {
    method: 'POST',
    body: JSON.stringify(rule)
  });
}

export function updateAlertRule(id, rule) {
  return request(`/alert-rules/${id}`, {
    method: 'PUT',
    body: JSON.stringify(rule)
  });
}
