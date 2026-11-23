"use client";

// Error boundary global App Router: menangkap error render yang tidak
// tertangani (mis. saat backend down dan sebuah error bocor ke render)
// supaya pengguna melihat halaman rapi, bukan overlay bawaan Next.js.
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { describeError } from "@/lib/errors";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Tetap log untuk debugging — jangan menelan error.
    console.error("[app error boundary]", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Terjadi kesalahan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {describeError(error)}
          </p>
          <Button className="w-full" onClick={reset}>
            Coba lagi
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
