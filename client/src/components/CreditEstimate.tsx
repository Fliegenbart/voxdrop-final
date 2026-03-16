import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Check, Coins } from "lucide-react";

import { cn } from "@/lib/utils";

type EstimateResponse = {
  costKey: string;
  quantity: number;
  label: string;
  unit: string;
  creditsPerUnit: number;
  estimatedCredits: number;
  currentBalance: number;
  sufficient: boolean;
};

export function CreditEstimate(props: { costKey: string; quantity: number }) {
  const quantity = Number.isFinite(props.quantity) ? Math.max(0, Math.ceil(props.quantity)) : 0;

  const { data, isLoading } = useQuery({
    queryKey: ["credits", "estimate", props.costKey, quantity],
    queryFn: async (): Promise<EstimateResponse> => {
      const res = await fetch("/api/credits/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ costKey: props.costKey, quantity }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Credit-Schätzung fehlgeschlagen");
      }
      return (await res.json()) as EstimateResponse;
    },
    enabled: quantity > 0,
  });

  if (quantity <= 0) return null;

  if (isLoading) {
    return <div className="text-sm text-slate-500">Berechne Credits...</div>;
  }

  if (!data) return null;

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-xl border text-sm",
        data.sufficient ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"
      )}
    >
      <div className="mt-0.5">
        {data.sufficient ? (
          <Check className="w-5 h-5 text-emerald-700" aria-hidden="true" />
        ) : (
          <AlertCircle className="w-5 h-5 text-red-700" aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0">
        <div className={cn("font-medium", data.sufficient ? "text-emerald-900" : "text-red-900")}>
          <span className="inline-flex items-center gap-2">
            <Coins className="w-4 h-4" aria-hidden="true" />
            ~{data.estimatedCredits} Credits
          </span>
        </div>
        <div className="text-slate-700">
          {data.quantity} {data.unit} x {data.creditsPerUnit} Credits
        </div>
        <div className={cn("mt-1", data.sufficient ? "text-emerald-800" : "text-red-800")}>
          {data.sufficient
            ? `Verfügbar: ${data.currentBalance} Credits`
            : `Nicht genug Credits (${data.currentBalance} verfügbar)`}
        </div>
      </div>
    </div>
  );
}

