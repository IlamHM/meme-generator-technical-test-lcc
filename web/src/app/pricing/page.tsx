"use client";

// Pricing: daftar paket dari backend; checkout lewat payment gateway mock.
// Logic checkout TKT-105 (idempotency key stabil + tombol disabled saat
// pending) tidak diubah — hanya styling sesuai design system.

import { useRouter } from "next/navigation";
import { useCheckout, usePlans, useSubscriptionStatus } from "@/lib/queries";
import { useMe } from "@/lib/auth";
import { describeError, isUnauthorized } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { QueryErrorNotice } from "@/components/query-error-notice";
import { BadgeCheck, Flame, Check } from "lucide-react";

function formatIdr(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function PricingPage() {
  const plans = usePlans();
  const status = useSubscriptionStatus();
  const checkout = useCheckout();
  const router = useRouter();
  const me = useMe();
  // Guest (401) dianggap belum berlangganan; error non-401 tetap ditampilkan.
  const statusUnauthorized = status.isError && isUnauthorized(status.error);
  const plansUnauthorized = plans.isError && isUnauthorized(plans.error);
  // Login = /auth/me sukses. Selama loading, anggap guest (UI aman untuk guest).
  const isLoggedIn = !me.isError && !me.isLoading && !!me.data;

  const handleSubscribe = (planCode: string) => {
    if (!isLoggedIn) {
      router.push("/login");
      return;
    }
    checkout.mutate(planCode, {
      onSuccess: (res) => router.push(`/checkout/${res.payment.reference}`),
    });
  };

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-8 bg-[#F8FAFC] p-6 md:p-8">
      {/* Status langganan — hanya untuk user login */}
      {isLoggedIn && status.data && (
        <div className="relative flex flex-col items-stretch justify-between gap-6 overflow-hidden rounded-2xl bg-white p-4 shadow-sm ring-1 ring-[#E2E8F0] sm:p-6 lg:flex-row lg:items-center">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#0F172A] text-white shadow-md">
              <BadgeCheck className="size-6" />
            </div>
            <div className="flex min-w-0 flex-col">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
                  {status.data.subscribed ? "Langganan Aktif" : "Status Langganan"}
                </span>
                {status.data.subscribed && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0F172A] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                    {status.data.planName}
                  </span>
                )}
              </div>
              <span className="mt-1 text-lg font-bold tracking-tight text-[#0F172A]">
                {status.data.subscribed && status.data.endsAt
                  ? `Aktif sampai ${new Date(status.data.endsAt).toLocaleString("id-ID")}`
                  : "Belum berlangganan"}
              </span>
            </div>
          </div>
          {status.data.subscribed && status.data.maxMemes > 0 && (
            <div className="flex w-full flex-col justify-center rounded-xl bg-[#F2F4F6] p-4 lg:w-96">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-xs font-semibold text-[#64748B]">Kuota Meme Digunakan</span>
                <span className="text-xs font-bold text-[#0F172A]">
                  {status.data.memesUsed} / {status.data.maxMemes}{" "}
                  <span className="font-normal text-[#64748B]">(sisa {status.data.maxMemes - status.data.memesUsed})</span>
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#E0E3E5]">
                <div
                  className="h-full rounded-full bg-[#0F172A] transition-all duration-1000 ease-out"
                  style={{ width: `${Math.round(((status.data.maxMemes - status.data.memesUsed) / status.data.maxMemes) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Heading */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
            Tingkatkan Kecepatan Produksi
          </span>
          <h1 className="text-[40px] leading-[44px] uppercase tracking-[0.03em] text-[#0F172A]" style={{ fontFamily: "var(--font-impact)" }}>
            Pilih Paket Generasi
          </h1>
        </div>
        <p className="max-w-md text-sm text-[#64748B]">
          Akses instan studio meme, rendering cepat, dan ekspor hasil tanpa ribet.
        </p>
      </div>

      {/* Error 401 (guest) ditekan; error non-401 tetap ditampilkan */}
      {plans.isError && !plansUnauthorized && (
        <QueryErrorNotice error={plans.error} onRetry={() => plans.refetch()} />
      )}
      {isLoggedIn && status.isError && !statusUnauthorized && (
        <QueryErrorNotice error={status.error} onRetry={() => status.refetch()} />
      )}
      {checkout.isError && (
        <p className="text-sm text-[#EF4444]">{describeError(checkout.error)}</p>
      )}

      {/* Kartu paket */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {plans.data?.map((plan, idx) => {
          const isActive = isLoggedIn && status.data?.subscribed && status.data.planCode === plan.code;
          const featured = !isActive && idx === 1;
          return (
            <div key={plan.id} className="relative flex flex-col justify-between overflow-hidden rounded-2xl bg-white p-6 shadow-sm ring-1 ring-[#E2E8F0] transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
              {isActive ? (
                <div className="absolute top-0 right-0 flex items-center gap-1 rounded-bl-xl bg-[#E6E8EA] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#45464D]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#0F172A]" />
                  Paket Aktif Saat Ini
                </div>
              ) : featured ? (
                <div className="absolute top-0 right-0 flex items-center gap-1 rounded-bl-xl bg-[#0F172A] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                  <Flame className="size-3" />
                  Populer
                </div>
              ) : null}
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
                  {plan.durationDays} hari masa aktif
                </span>
                <h3 className="mt-1 text-lg font-bold text-[#0F172A]">{plan.name}</h3>
                <div className="mt-4 mb-6 flex items-baseline gap-1">
                  <span className="text-[40px] leading-[44px] text-[#0F172A]" style={{ fontFamily: "var(--font-impact)" }}>
                    {formatIdr(plan.priceIdr)}
                  </span>
                  <span className="text-xs text-[#64748B]">/ {plan.durationDays} hari</span>
                </div>
                <div className="mb-6 rounded-lg bg-[#F2F4F6] p-3">
                  <span className="text-xs font-bold text-[#0F172A]">
                    {plan.durationDays} hari • {plan.maxMemes === 0 ? "Unlimited meme" : `${plan.maxMemes} kuota meme`}
                  </span>
                </div>
                <ul className="space-y-2 text-sm text-[#334155]">
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-[#0F172A]" />
                    {plan.maxMemes === 0 ? "Unlimited meme" : `${plan.maxMemes} meme`}
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-[#0F172A]" />
                    Akses penuh Meme Studio
                  </li>
                </ul>
              </div>
              <div className="mt-8">
                {isActive ? (
                  <div className="flex w-full cursor-default items-center justify-center gap-2 rounded-xl bg-[#E6E8EA] py-3 text-sm font-bold text-[#0F172A]">
                    Sedang Digunakan
                    <Check className="size-4" />
                  </div>
                ) : (
                  <Button
                    className="h-11 w-full rounded-xl bg-[#0F172A] text-sm font-bold uppercase tracking-wider text-white shadow-md transition-all hover:bg-black active:scale-[0.99]"
                    disabled={checkout.isPending}
                    onClick={() => handleSubscribe(plan.code)}
                  >
                    {checkout.isPending ? "Memproses…" : "Berlangganan"}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}