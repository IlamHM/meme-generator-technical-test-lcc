"use client";

// Halaman simulasi pembayaran (mock payment gateway).
// Di produksi halaman ini digantikan halaman payment gateway sungguhan
// yang memanggil webhook /confirm dengan verifikasi signature.
// Logic confirm (TKT-104/TKT-106) tidak diubah — hanya styling.

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirmPayment } from "@/lib/queries";
import { describeError } from "@/lib/errors";

export default function CheckoutPage() {
  const { reference } = useParams<{ reference: string }>();
  const router = useRouter();
  const confirm = useConfirmPayment();

  const onPay = () => {
    // Error dibiarkan masuk state mutation (confirm.isError / confirm.error)
    // supaya ditampilkan ke pengguna, bukan ditelan.
    confirm.mutate(reference, {
      onSuccess: () => setTimeout(() => router.push("/pricing"), 1200),
    });
  };

  const paid = !!confirm.data;

  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-[#F8FAFC] p-4 md:p-8">
      <div className="w-full max-w-md">
        <div className="relative w-full overflow-hidden rounded-2xl bg-white p-6 shadow-xl ring-1 ring-[#E2E8F0] md:p-8">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-[#0F172A] to-transparent opacity-80" />

          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#0F172A] text-white shadow-md">
              <ShieldCheck className="size-6" />
            </div>
            <h1
              className="text-[28px] leading-[32px] uppercase tracking-[0.03em] text-[#0F172A]"
              style={{ fontFamily: "var(--font-impact)" }}
            >
              Simulasi Pembayaran
            </h1>
            <p className="mt-1 text-sm text-[#64748B]">
              Payment gateway mock — tidak ada uang sungguhan.
            </p>
          </div>

          <div className="mb-6 space-y-4">
            <div className="flex items-center justify-between rounded-xl bg-[#F2F4F6] px-4 py-3 text-sm">
              <span className="font-semibold text-[#64748B]">Referensi</span>
              <span className="font-mono text-xs text-[#0F172A]">
                {reference}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-[#F2F4F6] px-4 py-3">
              <span className="text-sm font-semibold text-[#64748B]">
                Status
              </span>
              {paid ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0F172A] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Lunas
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E6E8EA] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#45464D]">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#0F172A]" />
                  Menunggu Pembayaran
                </span>
              )}
            </div>

            {paid && (
              <p className="flex items-center justify-center gap-2 text-center text-sm font-semibold text-emerald-600">
                <CheckCircle2 className="size-4" />
                Pembayaran berhasil! Langganan Anda aktif. Mengalihkan…
              </p>
            )}
            {confirm.isError && (
              <p className="flex items-center justify-center gap-2 text-center text-sm font-semibold text-[#EF4444]">
                <XCircle className="size-4" />
                Pembayaran gagal: {describeError(confirm.error)}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              className="h-11 flex-1 rounded-xl bg-[#0F172A] text-sm font-bold uppercase tracking-wider text-white shadow-md transition-all hover:bg-black active:scale-[0.99]"
              onClick={onPay}
              disabled={confirm.isPending || paid}
            >
              {confirm.isPending
                ? "Memproses…"
                : paid
                  ? "Lunas"
                  : "Bayar Sekarang (Simulasi)"}
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-11 rounded-xl border-[#E2E8F0]"
            >
              <Link href="/pricing">Batal</Link>
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
