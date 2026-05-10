import crypto from 'node:crypto';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { CronListClient } from './CronListClient';
import { getCronInventory, getCronList, getCurrentUser, getScopeOptions } from '@/lib/api';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;
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

export default async function CronListPage({ searchParams }) {
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
    view: ['inventory', 'runtime'].includes(resolvedSearchParams?.view)
      ? resolvedSearchParams.view
      : 'inventory',
    cron_name: resolvedSearchParams?.cron_name || '',
    server: resolvedSearchParams?.server || '',
    status: resolvedSearchParams?.status || '',
    env: resolvedSearchParams?.env || '',
    service_group: resolvedSearchParams?.service_group || '',
    range: ['today', '7d', '30d'].includes(resolvedSearchParams?.range)
      ? resolvedSearchParams.range
      : 'today'
  };
  let response = { jobs: [], has_more: false, next_offset: 0, limit: PAGE_SIZE, offset: 0 };
  let inventoryResponse = { inventory: [], summary: {}, now_wib: null };
  let scopeOptions = { environments: [], service_groups: [] };
  let currentUser = userFromSessionCookie(cookie);
  let error = null;

  try {
    const [cronResponse, inventory, scopeResponse, userResponse] = await Promise.all([
      filters.view === 'runtime'
        ? getCronList({ ...filters, limit: PAGE_SIZE, offset: 0 }, apiOptions)
        : Promise.resolve(response),
      getCronInventory({
        cron_name: filters.cron_name,
        server: filters.server,
        env: filters.env,
        service_group: filters.service_group
      }, apiOptions),
      getScopeOptions(apiOptions).catch((scopeError) => {
        if (scopeError?.status === 401) {
          throw scopeError;
        }

        return { environments: [], service_groups: [] };
      }),
      getCurrentUser(apiOptions).catch((userError) => {
        if (userError?.status === 401) {
          throw userError;
        }

        return { user: null };
      })
    ]);
    response = cronResponse || response;
    inventoryResponse = inventory || inventoryResponse;
    currentUser = userResponse?.user || currentUser;
    scopeOptions = {
      environments: Array.isArray(scopeResponse?.environments) ? scopeResponse.environments : [],
      service_groups: Array.isArray(scopeResponse?.service_groups) ? scopeResponse.service_groups : []
    };
  } catch (fetchError) {
    if (fetchError?.status === 401) {
      redirect('/login?next=/cron');
    }

    console.error('Failed to fetch cron list:', fetchError);
    error = fetchError?.message || 'Failed to load cron jobs';
  }

  return (
    <CronListClient
      initialJobs={Array.isArray(response?.jobs) ? response.jobs : []}
      initialPagination={{
        has_more: Boolean(response?.has_more),
        next_offset: Number(response?.next_offset || 0),
        limit: Number(response?.limit || PAGE_SIZE),
        offset: Number(response?.offset || 0)
      }}
      initialInventory={Array.isArray(inventoryResponse?.inventory) ? inventoryResponse.inventory : []}
      inventorySummary={inventoryResponse?.summary || {}}
      inventoryNowWib={inventoryResponse?.now_wib || null}
      scopeOptions={scopeOptions}
      filters={filters}
      error={error}
      canManageHeartbeat={currentUser?.role === 'admin'}
    />
  );
}
