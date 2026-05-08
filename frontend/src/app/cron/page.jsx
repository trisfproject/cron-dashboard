import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { CronListClient } from './CronListClient';
import { getCronList, getScopeOptions } from '@/lib/api';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

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
  let scopeOptions = { environments: [], service_groups: [] };
  let error = null;

  try {
    const [cronResponse, scopeResponse] = await Promise.all([
      getCronList({ ...filters, limit: PAGE_SIZE, offset: 0 }, apiOptions),
      getScopeOptions(apiOptions).catch((scopeError) => {
        if (scopeError?.status === 401) {
          throw scopeError;
        }

        return { environments: [], service_groups: [] };
      })
    ]);
    response = cronResponse || response;
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
      scopeOptions={scopeOptions}
      filters={filters}
      error={error}
    />
  );
}
