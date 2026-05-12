import crypto from 'node:crypto';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { CronInventoryClient } from './CronInventoryClient';
import { getCronInventory, getCurrentUser, getScopeOptions } from '@/lib/api';
import { isAdminOrHigher } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

const SESSION_COOKIE = 'nyx_session';

function parseCookie(header) {
  return String(header || '')
    .split(';')
    .map((part) => part.trim())
    .reduce((cookies, part) => {
      const separator = part.indexOf('=');

      if (separator > -1) {
        cookies[part.slice(0, separator)] = decodeURIComponent(part.slice(separator + 1));
      }

      return cookies;
    }, {});
}

function timingSafeCompare(left, right) {
  const leftBuffer = Buffer.from(left || '');
  const rightBuffer = Buffer.from(right || '');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function decodeBase64url(value) {
  const normalized = String(value || '').replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function userFromSessionCookie(cookieHeader) {
  const token = parseCookie(cookieHeader)[SESSION_COOKIE];
  const secret = process.env.AUTH_SECRET || process.env.API_KEY;

  if (!token || !secret) {
    return null;
  }

  const [header, payload, signature] = String(token).split('.');

  if (!header || !payload || !signature) {
    return null;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');

  if (!timingSafeCompare(signature, expected)) {
    return null;
  }

  try {
    const decoded = JSON.parse(decodeBase64url(payload));

    if (Number(decoded.exp || 0) * 1000 <= Date.now()) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

export default async function CronInventoryPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const requestHeaders = await headers();
  const cookie = requestHeaders.get('cookie') || '';
  const authorization = requestHeaders.get('authorization') || '';
  const apiOptions = {
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(authorization ? { authorization } : {})
    }
  };
  const filters = {
    cron_name: resolvedSearchParams?.cron_name || '',
    server: resolvedSearchParams?.server || '',
    env: resolvedSearchParams?.env || '',
    service_group: resolvedSearchParams?.service_group || ''
  };
  let currentUser = userFromSessionCookie(cookie);
  let inventoryResponse = { inventory: [], summary: {}, now_wib: null };
  let scopeOptions = { environments: [], service_groups: [] };
  let error = null;

  try {
    const userResponse = await getCurrentUser(apiOptions);
    currentUser = userResponse?.user || currentUser;

    if (!isAdminOrHigher(currentUser)) {
      redirect('/cron');
    }

    const [inventory, scopeResponse] = await Promise.all([
      getCronInventory(filters, apiOptions),
      getScopeOptions(apiOptions).catch((scopeError) => {
        if (scopeError?.status === 401) {
          throw scopeError;
        }

        return { environments: [], service_groups: [] };
      })
    ]);

    inventoryResponse = inventory || inventoryResponse;
    scopeOptions = {
      environments: Array.isArray(scopeResponse?.environments) ? scopeResponse.environments : [],
      service_groups: Array.isArray(scopeResponse?.service_groups) ? scopeResponse.service_groups : []
    };
  } catch (fetchError) {
    if (String(fetchError?.digest || '').startsWith('NEXT_REDIRECT')) {
      throw fetchError;
    }

    if (fetchError?.status === 401) {
      redirect('/login?next=/cron/inventory');
    }

    if (fetchError?.status === 403) {
      redirect('/cron');
    }

    console.error('Failed to fetch cron inventory:', fetchError);
    error = fetchError?.message || 'Failed to load cron inventory';
  }

  return (
    <CronInventoryClient
      initialInventory={Array.isArray(inventoryResponse?.inventory) ? inventoryResponse.inventory : []}
      inventorySummary={inventoryResponse?.summary || {}}
      inventoryNowWib={inventoryResponse?.now_wib || null}
      scopeOptions={scopeOptions}
      filters={filters}
      error={error}
    />
  );
}
