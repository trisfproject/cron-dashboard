import { statusClass, statusLabel } from '@/lib/format';

export function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ${statusClass(status)}`}>
      {statusLabel(status)}
    </span>
  );
}

