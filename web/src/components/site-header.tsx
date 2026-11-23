"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { intervalToDuration, formatDuration, parseISO } from "date-fns";
import { id } from "date-fns/locale";
import { User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Separator } from "@/components/ui/separator";
import { useLogout, useMe } from "@/lib/auth";
import { useSubscriptionStatus } from "@/lib/queries";

const links = [
  { href: "/studio", label: "Studio" },
  { href: "/pricing", label: "Paket" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const me = useMe();
  const logout = useLogout();
  const user = me.data;
  const sub = useSubscriptionStatus();

  // Countdown masa aktif: tick tiap detik agar sisa waktu selalu berjalan.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const sisaWaktu =
    sub.data?.subscribed && sub.data.endsAt
      ? (() => {
          const ends = parseISO(sub.data.endsAt).getTime();
          if (ends <= now) return "habis";
          const dur = intervalToDuration({ start: now, end: ends });
          return formatDuration(dur, {
            locale: id,
            format: ["days", "hours", "minutes", "seconds"],
          });
        })()
      : null;

  const kuota =
    sub.data?.subscribed && sub.data.maxMemes > 0
      ? `${sub.data.maxMemes - sub.data.memesUsed} / ${sub.data.maxMemes} kuota tersisa`
      : null;

  return (
    <header className="sticky top-0 z-50 border-b border-[#E2E8F0] bg-[#F8FAFC]/90 shadow-[0_1px_8px_rgba(0,0,0,0.02)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <div className="flex items-center gap-10">
          <Link
            href="/"
            className="text-[20px] uppercase tracking-[0.03em] text-[#0F172A] select-none"
            style={{ fontFamily: "var(--font-impact)" }}
          >
            MEME PORTAL
          </Link>
          <nav className="hidden h-16 items-center gap-6 md:flex">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={
                  "flex h-full items-center text-sm font-semibold transition-colors " +
                  (pathname.startsWith(l.href)
                    ? "border-b-2 border-[#0F172A] text-[#0F172A]"
                    : "text-[#64748B] hover:text-[#0F172A]")
                }
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {user ? (
            <>
              {kuota && (
                <span className="hidden items-center gap-1.5 rounded-full bg-[#E6E8EA] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#45464D] sm:flex">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#0F172A]" />
                  {kuota}
                </span>
              )}
              <div className="hidden items-center gap-2 border-l border-[#E2E8F0] pl-3 sm:flex">
                <HoverCard openDelay={100} closeDelay={150}>
                  <HoverCardTrigger asChild>
                    <button
                      className="cursor-pointer text-xs font-semibold text-[#0F172A] underline-offset-4 hover:underline"
                      aria-label="Info akun"
                    >
                      {user.name || user.email}
                    </button>
                  </HoverCardTrigger>
                  <HoverCardContent className="w-72" align="end">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">{user.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                    <Separator className="my-3" />
                    <div className="space-y-1 text-sm">
                      <p className="font-medium">Langganan</p>
                      {sub.data?.subscribed ? (
                        <>
                          <p className="text-muted-foreground">
                            Paket: {sub.data.planName}
                          </p>
                          <p className="text-muted-foreground">
                            Berakhir dalam{" "}
                            <span className="font-medium text-foreground">
                              {sisaWaktu}
                            </span>
                          </p>
                        </>
                      ) : (
                        <p className="text-muted-foreground">
                          Belum berlangganan —{" "}
                          <Link href="/pricing" className="underline">
                            pilih paket
                          </Link>
                        </p>
                      )}
                    </div>
                  </HoverCardContent>
                </HoverCard>
                <button
                  onClick={() => logout.mutate()}
                  disabled={logout.isPending}
                  className="text-[10px] font-bold uppercase tracking-wider text-[#64748B] transition-colors hover:text-[#EF4444]"
                >
                  Keluar
                </button>
              </div>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0F172A] text-white">
                <User className="size-4" />
              </div>
            </>
          ) : (
            <>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="rounded-xl text-[#64748B] hover:text-[#0F172A]"
              >
                <Link href="/login">Masuk</Link>
              </Button>
              <Button
                asChild
                size="sm"
                className="rounded-xl bg-[#0F172A] text-white hover:bg-black"
              >
                <Link href="/register">Daftar</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
