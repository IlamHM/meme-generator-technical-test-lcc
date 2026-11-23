"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "@tanstack/react-form";
import { User, Mail, Lock, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRegister, useMe } from "@/lib/auth";
import { apiErrorMessage } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const register = useRegister();
  const me = useMe();

  // Sama seperti /login: guard berdasarkan query /auth/me, bukan cookie
  // mentah — cookie bisa basi setelah logout dan memicu redirect loop.
  useEffect(() => {
    if (!me.isLoading && me.data) {
      router.replace("/");
    }
  }, [me.isLoading, me.data, router]);

  const form = useForm({
    defaultValues: { name: "", email: "", password: "" },
    onSubmit: async ({ value }) => {
      await register.mutateAsync(value);
      router.push("/pricing"); // setelah daftar, ajak berlangganan dulu
    },
  });

  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-[#F8FAFC] p-4 md:p-8">
      <div className="w-full max-w-[480px]">
        <div className="relative w-full overflow-hidden rounded-2xl bg-white p-6 shadow-xl ring-1 ring-[#E2E8F0] md:p-10">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-[#0F172A] to-transparent opacity-80" />

          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#0F172A] text-white shadow-md">
              <span
                className="text-[32px] leading-none tracking-wider"
                style={{ fontFamily: "var(--font-impact)" }}
              >
                MP
              </span>
            </div>
            <h1
              className="text-[32px] leading-[36px] uppercase tracking-[0.03em] text-[#0F172A]"
              style={{ fontFamily: "var(--font-impact)" }}
            >
              MEME PORTAL
            </h1>
            <p className="mt-1 max-w-[280px] text-sm text-[#64748B]">
              Buat akun baru dan mulai berkarya.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              form.handleSubmit();
            }}
            className="flex flex-col gap-4"
          >
            <form.Field name="name">
              {(field) => (
                <div className="space-y-1.5">
                  <Label
                    htmlFor={field.name}
                    className="text-xs font-semibold uppercase tracking-wider text-[#0F172A]"
                  >
                    Nama
                  </Label>
                  <div className="relative flex items-center">
                    <User className="pointer-events-none absolute left-3.5 size-4 text-[#64748B]" />
                    <Input
                      id={field.name}
                      placeholder="Nama Anda"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      className="h-11 rounded-xl border-[#E2E8F0] bg-[#F2F4F6] pl-10 transition-colors focus-visible:border-[#0F172A] focus-visible:bg-white focus-visible:ring-[#0F172A]/10"
                    />
                  </div>
                </div>
              )}
            </form.Field>

            <form.Field
              name="email"
              validators={{
                onChange: ({ value }) =>
                  !value ? "Email wajib diisi" : undefined,
              }}
            >
              {(field) => (
                <div className="space-y-1.5">
                  <Label
                    htmlFor={field.name}
                    className="text-xs font-semibold uppercase tracking-wider text-[#0F172A]"
                  >
                    Email
                  </Label>
                  <div className="relative flex items-center">
                    <Mail className="pointer-events-none absolute left-3.5 size-4 text-[#64748B]" />
                    <Input
                      id={field.name}
                      type="email"
                      placeholder="nama@email.com"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      className="h-11 rounded-xl border-[#E2E8F0] bg-[#F2F4F6] pl-10 transition-colors focus-visible:border-[#0F172A] focus-visible:bg-white focus-visible:ring-[#0F172A]/10"
                    />
                  </div>
                  {field.state.meta.errors.length > 0 && (
                    <p className="text-sm text-[#EF4444]">
                      {field.state.meta.errors[0]}
                    </p>
                  )}
                </div>
              )}
            </form.Field>

            <form.Field
              name="password"
              validators={{
                onChange: ({ value }) =>
                  value.length < 8
                    ? "Password minimal 8 karakter"
                    : undefined,
              }}
            >
              {(field) => (
                <div className="space-y-1.5">
                  <Label
                    htmlFor={field.name}
                    className="text-xs font-semibold uppercase tracking-wider text-[#0F172A]"
                  >
                    Password
                  </Label>
                  <div className="relative flex items-center">
                    <Lock className="pointer-events-none absolute left-3.5 size-4 text-[#64748B]" />
                    <Input
                      id={field.name}
                      type="password"
                      placeholder="Minimal 8 karakter"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      className="h-11 rounded-xl border-[#E2E8F0] bg-[#F2F4F6] pl-10 transition-colors focus-visible:border-[#0F172A] focus-visible:bg-white focus-visible:ring-[#0F172A]/10"
                    />
                  </div>
                  {field.state.meta.errors.length > 0 && (
                    <p className="text-sm text-[#EF4444]">
                      {field.state.meta.errors[0]}
                    </p>
                  )}
                </div>
              )}
            </form.Field>

            {register.isError && (
              <p className="text-sm text-[#EF4444]">
                {register.error
                  ? apiErrorMessage(register.error, "Pendaftaran gagal")
                  : "Pendaftaran gagal"}
              </p>
            )}

            <Button
              type="submit"
              disabled={register.isPending}
              className="mt-1 h-11 w-full rounded-xl bg-[#0F172A] text-sm font-semibold uppercase tracking-wider text-white shadow-md transition-all hover:bg-black active:scale-[0.99]"
            >
              {register.isPending ? "Memproses…" : "Daftar"}
              <ArrowRight className="ml-1 size-4" />
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-[#64748B]">
              Sudah punya akun?{" "}
              <Link
                href="/login"
                className="font-bold text-[#0F172A] underline-offset-4 hover:underline"
              >
                Masuk
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
