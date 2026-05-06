const API_URL = process.env.INTERNAL_API_URL || 'http://localhost:4000';

async function request(path) {
  const response = await fetch(`${API_URL}${path}`, {
    next: { revalidate: 15 }
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export function getStats() {
  return request('/stats');
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

