"use client";

// Banner error ringan untuk state error TanStack Query (mis. backend tidak
// bisa dihubungi) — menampilkan pesan ramah + tombol retry, tanpa crash.
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { describeError } from "@/lib/errors";

export function QueryErrorNotice({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  useEffect(() => {
    console.error("[query error]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm">
      <p className="text-destructive">{describeError(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Coba lagi
        </Button>
      )}
    </div>
  );
}
