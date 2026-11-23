"use client";

// Halaman depan dengan guard auth. BUG: jika !me.data dialihkan ke /login,
// sementara /login mengembalikan ke sini bila cookie masih ada —
// kombinasi keduanya bisa menghasilkan redirect loop tak berujung.
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useMe } from "@/lib/auth";
import { QueryErrorNotice } from "@/components/query-error-notice";

export default function Home() {
  const router = useRouter();
  const me = useMe();

  useEffect(() => {
    // Jangan redirect saat query error (mis. backend down) — itu bukan
    // berarti belum login, dan redirect bisa memicu loop.
    if (!me.isLoading && !me.isError && !me.data) {
      router.replace("/login");
    }
  }, [me.isLoading, me.isError, me.data, router]);

  if (me.isError) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
        <div className="w-full max-w-md">
          <QueryErrorNotice error={me.error} onRetry={() => me.refetch()} />
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <h1
        className="text-6xl font-bold tracking-tight text-center"
        style={{ fontFamily: "var(--font-impact)" }}
      >
        MEME PORTAL
      </h1>
      <p className="text-muted-foreground text-center max-w-md">
        Meme generator berlangganan. Upload gambar dasar, tulis teks dengan
        font Impact, dan bagikan hasilnya.
      </p>
      <div className="flex gap-4">
        <Button asChild>
          <Link href="/studio">Buat Meme</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/pricing">Lihat Paket</Link>
        </Button>
      </div>
    </main>
  );
}
