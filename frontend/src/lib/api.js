const API_URL = '/api';

async function request(path) {
  const response = await fetch(`${API_URL}${path}`, {
    cache: 'no-store'
  });

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
