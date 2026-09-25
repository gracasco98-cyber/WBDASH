// hooks/usePpcBillingCycle.ts — Amazon Ads threshold-billing cycle(s) for an
// account scope ("ALL" or one account id), shared by the dashboard "Adspay"
// cell and the Amazon overview card.

import { useEffect, useMemo, useState } from "react";
import { api, type AmazonPpcBillingCycle } from "@/lib/api";

export interface PpcBillingCycleState {
  cycles: AmazonPpcBillingCycle[];
  /** The cycle closest to its charge — the one worth watching when several accounts are in scope. */
  primary: AmazonPpcBillingCycle | null;
  isLoading: boolean;
  hasError: boolean;
}

export function usePpcBillingCycle(amazonAccountId: string, refreshKey: unknown = 0): PpcBillingCycleState {
  const [cycles, setCycles] = useState<AmazonPpcBillingCycle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.amazon.ppcBillingCycle({ amazonAccountId })
      .then(({ cycles: loaded }) => {
        if (cancelled) return;
        setCycles(loaded);
        setHasError(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setCycles([]);
        setHasError(true);
        console.error("[usePpcBillingCycle] Failed to load PPC billing cycle:", err);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [amazonAccountId, refreshKey]);

  const primary = useMemo(
    () => [...cycles].sort((a, b) => b.progressPct - a.progressPct)[0] ?? null,
    [cycles],
  );

  return { cycles, primary, isLoading, hasError };
}
