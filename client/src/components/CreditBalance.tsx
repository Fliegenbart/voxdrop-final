import { useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Coins } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

type CreditBalanceResponse = {
  balance: number;
  reserved: number;
  available: number;
  total: number;
  planId: string;
  monthlyLimit?: number;
  monthlyConsumed?: number;
};

export function CreditBalance() {
  const { isAuthenticated, isLoading, refreshUser } = useAuth();
  const refreshInFlightRef = useRef<Promise<boolean> | null>(null);

  const refreshSessionOnce = useCallback(async (): Promise<boolean> => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;

    refreshInFlightRef.current = (async () => {
      try {
        const response = await fetch("/api/auth/refresh", {
          method: "POST",
          credentials: "include",
        });
        return response.ok;
      } catch {
        return false;
      } finally {
        refreshInFlightRef.current = null;
      }
    })();

    return refreshInFlightRef.current;
  }, []);

  const { data } = useQuery({
    queryKey: ["credits", "balance"],
    queryFn: async (): Promise<CreditBalanceResponse | null> => {
      const fetchBalance = () => fetch("/api/credits/balance", { credentials: "include" });

      let res = await fetchBalance();
      if (res.status === 401) {
        const refreshed = await refreshSessionOnce();
        if (refreshed) {
          res = await fetchBalance();
        }
      }

      if (!res.ok) {
        if (res.status === 401) {
          await refreshUser();
        }
        return null;
      }

      return (await res.json()) as CreditBalanceResponse;
    },
    enabled: isAuthenticated && !isLoading,
    retry: false,
    refetchInterval: 30_000,
  });

  if (!data) return null;

  const monthlyLimit = typeof data.monthlyLimit === "number" ? data.monthlyLimit : 0;
  const ratio = monthlyLimit > 0 ? data.balance / monthlyLimit : 1;
  const isCritical = ratio <= 0.05;
  const isLow = !isCritical && ratio <= 0.2;

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm border",
        isCritical
          ? "bg-red-50 border-red-200 text-red-700"
          : isLow
            ? "bg-amber-50 border-amber-200 text-amber-700"
            : "bg-slate-50 border-slate-200 text-slate-700"
      )}
      title={`Verfuegbar: ${data.balance} | Reserviert: ${data.reserved}`}
    >
      {isCritical ? (
        <AlertTriangle className="w-4 h-4" aria-hidden="true" />
      ) : (
        <Coins className="w-4 h-4" aria-hidden="true" />
      )}
      <span className="font-medium tabular-nums">
        {data.balance.toLocaleString("de-DE")}
        {monthlyLimit > 0 ? ` / ${monthlyLimit.toLocaleString("de-DE")}` : ""}
      </span>
    </div>
  );
}
