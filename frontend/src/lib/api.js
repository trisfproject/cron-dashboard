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

export class AuthenticationRequiredError extends Error {
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'AuthenticationRequiredError';
    this.status = 401;
  }
}

export function isAuthenticationRequired(error) {
  return error instanceof AuthenticationRequiredError || Number(error?.status) === 401;
}

function redirectToLogin() {
  if (typeof window === 'undefined') {
    return;
  }

  const currentPath = `${window.location.pathname}${window.location.search}`;
  const loginUrl = new URL('/login', window.location.origin);

  if (currentPath && currentPath !== '/login') {
    loginUrl.searchParams.set('next', currentPath);
  }

  window.location.assign(loginUrl.toString());
}

async function request(path, options = {}) {
  let response;
  const { headers: optionHeaders, credentials, ...fetchOptions } = options;

  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      cache: 'no-store',
      ...fetchOptions,
      credentials: credentials || 'include',
      headers: {
        ...(fetchOptions.body ? { 'content-type': 'application/json' } : {}),
        ...(optionHeaders || {})
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

    if (response.status === 401) {
      if (path !== '/auth/login') {
        redirectToLogin();
      }

      throw new AuthenticationRequiredError(detail ? detail.slice(2) : 'Authentication required');
    }

    const error = new Error(`API request failed: ${response.status} ${response.statusText}${detail}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export function getStats(params = {}, options = {}) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }

  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request(`/stats${suffix}`, options);
}

export function getCronList(params = {}, options = {}) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }

  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request(`/cron-list${suffix}`, options);
}

export function getLogs(params = {}, options = {}) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }

  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request(`/logs${suffix}`, options);
}

export function getAlerts(params = {}, options = {}) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }

  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request(`/alerts${suffix}`, options);
}

export function getScopeOptions(options = {}) {
  return request('/scope-options', options);
}

export function login(email, password) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
}

export function logout() {
  return request('/auth/logout', {
    method: 'POST',
    body: JSON.stringify({})
  });
}

export function getCurrentUser() {
  return request('/auth/me');
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

export function getUsers() {
  return request('/users');
}

export function createUser(user) {
  return request('/users', {
    method: 'POST',
    body: JSON.stringify(user)
  });
}

export function updateUser(id, user) {
  return request(`/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(user)
  });
}

export function resetUserPassword(id, password) {
  return request(`/users/${id}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ password })
  });
}

export function deactivateUser(id) {
  return request(`/users/${id}/deactivate`, {
    method: 'POST',
    body: JSON.stringify({})
  });
}

export function reactivateUser(id) {
  return request(`/users/${id}/reactivate`, {
    method: 'POST',
    body: JSON.stringify({})
  });
}

export function forceLogoutUser(id) {
  return request(`/users/${id}/force-logout`, {
    method: 'POST',
    body: JSON.stringify({})
  });
}

export function archiveUser(id) {
  return request(`/users/${id}/archive`, {
    method: 'POST',
    body: JSON.stringify({})
  });
}

export function deleteUser(id, permanent = false) {
  return request(`/users/${id}/delete`, {
    method: 'POST',
    body: JSON.stringify({ permanent })
  });
}

export function canDeleteUser(id) {
  return request(`/users/${id}/can-delete`);
}

export function getAuditLogs(params = {}) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }

  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request(`/audit-logs${suffix}`);
}

export function getAuthActivity() {
  return request('/auth/activity');
}

export function changePassword(payload) {
  return request('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
