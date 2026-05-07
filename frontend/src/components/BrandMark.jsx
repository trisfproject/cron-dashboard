'use client';

import { useState } from 'react';
import { Activity } from 'lucide-react';

export function BrandMark() {
  const [lightLogoOk, setLightLogoOk] = useState(true);
  const [darkLogoOk, setDarkLogoOk] = useState(true);

  return (
    <span className="relative flex h-9 w-9 items-center justify-center rounded-md bg-ink p-2 text-white dark:bg-blue-600">
      {lightLogoOk ? (
        <img src="/logo-light.png" alt="" className="h-6 w-6 object-contain dark:hidden" onError={() => setLightLogoOk(false)} />
      ) : null}
      {darkLogoOk ? (
        <img src="/logo-dark.png" alt="" className="hidden h-6 w-6 object-contain dark:block" onError={() => setDarkLogoOk(false)} />
      ) : null}
      {!lightLogoOk && !darkLogoOk ? <Activity className="h-5 w-5" aria-hidden="true" /> : null}
    </span>
  );
}
