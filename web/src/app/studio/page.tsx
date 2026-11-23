"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, unwrap } from "@/lib/api";
import { describeError, isUnauthorized } from "@/lib/errors";
import { useMe } from "@/lib/auth";
import { QueryErrorNotice } from "@/components/query-error-notice";
import {
  useCompleteMeme,
  useMemes,
  usePrepareUpload,
  useSubscriptionStatus,
} from "@/lib/queries";

// Alur render:
// 1. prepare upload → presigned PUT untuk gambar dasar
// 2. PUT gambar dasar langsung ke Garage (S3)
// 3. render canvas: gambar dasar + teks atas/bawah font Impact
// 4. presign via result-upload → PUT hasil PNG
// 5. complete → simpan URL hasil ke database

const FONT_STACK = "Impact, 'Arial Narrow Bold', sans-serif";
const FONT_SIZES = [24, 32, 40, 48, 56, 64, 72];
const DEFAULT_FONT_SIZE = 48;

// Family Anton (fallback Impact di Linux) di-resolve dari CSS var next/font.
function canvasFont(size: number): string {
  let anton = "";
  try {
    anton = getComputedStyle(document.documentElement)
      .getPropertyValue("--font-anton")
      .trim();
  } catch {
    /* SSR / non-browser: lewati */
  }
  const stack = anton ? `${FONT_STACK}, ${anton}` : FONT_STACK;
  return `bold ${size}px ${stack}`;
}

// fontScale: pengali ukuran font dasar (width/12). Default 1.
function drawMeme(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  top: string,
  bottom: string,
  fontScale = 1,
) {
  const maxW = 800;
  const scale = Math.min(1, maxW / img.width);
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const baseSize = Math.max(16, Math.round(canvas.width / 12));
  const fontSize = Math.max(16, Math.round(baseSize * fontScale));
  ctx.font = canvasFont(fontSize);
  ctx.textAlign = "center";
  // Gaya meme klasik (seperti contoh Impact meme): teks putih kapital,
  // outline hitam tebal.
  ctx.fillStyle = "#fefefe";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = fontSize / 8;
  ctx.lineJoin = "round";

  const margin = fontSize / 3;
  const wrap = (text: string, maxWidth: number): string[] => {
    const lines: string[] = [];
    let line = "";
    for (const word of text.toUpperCase().split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    return lines;
  };

  const maxWidth = canvas.width - margin * 2;
  const topLines = wrap(top, maxWidth);
  const bottomLines = wrap(bottom, maxWidth);

  let y = margin + fontSize * 0.85;
  for (const line of topLines) {
    ctx.strokeText(line, canvas.width / 2, y);
    ctx.fillText(line, canvas.width / 2, y);
    y += fontSize * 1.1;
  }
  y = canvas.height - margin - (bottomLines.length - 1) * fontSize * 1.1;
  for (const line of bottomLines) {
    ctx.strokeText(line, canvas.width / 2, y);
    ctx.fillText(line, canvas.width / 2, y);
    y += fontSize * 1.1;
  }
}

async function putToS3(uploadUrl: string, blob: Blob) {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    body: blob,
    headers: { "Content-Type": blob.type },
  });
  if (!res.ok) throw new Error(`upload ke S3 gagal: ${res.status}`);
}

interface ResultUploadData {
  uploadUrl: string;
  baseUrl: string;
}

export default function StudioPage() {
  const router = useRouter();
  const me = useMe();
  const status = useSubscriptionStatus();
  const memes = useMemes();
  const prepare = usePrepareUpload();
  const complete = useCompleteMeme();

  const [title, setTitle] = useState("");
  const [top, setTop] = useState("");
  const [bottom, setBottom] = useState("");
  // Ukuran font yang dipilih user (px pada canvas 800px).
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Render ulang preview setiap teks/ukuran berubah — jangan pakai rAF dari
  // handler onChange, karena closure-nya masih memegang state LAMA (bug lama:
  // teks yang sudah dihapus masih tampil di canvas).
  useEffect(() => {
    renderPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top, bottom, fontSize]);

  const renderPreview = () => {
    const canvas = document.getElementById(
      "meme-canvas",
    ) as HTMLCanvasElement | null;
    if (!canvas || !imgRef.current) return;
    drawMeme(canvas, imgRef.current, top, bottom, fontSize / 66);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Pilih gambar dasar dulu.");
      return;
    }
    setBusy(true);
    try {
      // Pastikan fallback font (Anton) sudah termuat sebelum dirender ke canvas.
      await document.fonts.ready;
      const img = new Image();
      img.src = URL.createObjectURL(file);
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("gambar tidak bisa dibaca"));
      });
      imgRef.current = img;

      // 1) presign gambar dasar
      const prepared = await prepare.mutateAsync({ title, filename: file.name });
      // 2) unggah gambar dasar ke Garage
      await putToS3(prepared.uploadUrl, file);

      // 3) render hasil ke PNG
      const resultCanvas = document.createElement("canvas");
      drawMeme(resultCanvas, img, top, bottom, fontSize / 66);
      const blob = await new Promise<Blob>((resolve, reject) =>
        resultCanvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("render gagal"))),
          "image/png",
        ),
      );

      // 4) presign + unggah hasil
      const result = unwrap<ResultUploadData>(
        await api.post(`/api/v1/memes/${prepared.id}/result-upload`),
      );
      await putToS3(result.uploadUrl, blob);

      // 5) complete
      await complete.mutateAsync({ id: prepared.id, resultUrl: result.baseUrl });
      memes.refetch();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const subscribed = status.data?.subscribed ?? false;
  const quotaLeft =
    status.data && status.data.maxMemes > 0
      ? status.data.maxMemes - status.data.memesUsed
      : null;
  const quotaTotal =
    status.data && status.data.maxMemes > 0 ? status.data.maxMemes : null;

  // Belum login (401 pada /auth/me atau /subscription/status) ? alihkan ke
  // /login via useEffect agar tidak memicu setState saat render.
  const unauthorized =
    (me.isError && isUnauthorized(me.error)) ||
    (status.isError && isUnauthorized(status.error));
  useEffect(() => {
    if (unauthorized) router.replace("/login");
  }, [unauthorized, router]);

  if (unauthorized) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <p className="text-[#64748B]">Mengalihkan ke halaman masuk?</p>
      </main>
    );
  }
  // Gate: halaman studio hanya untuk user yang sudah berlangganan.
  if (me.isError || status.isError) {
    const q = me.isError ? me : status;
    return (
      <main className="mx-auto max-w-3xl space-y-4 p-8">
        <h1
          className="text-4xl uppercase"
          style={{ fontFamily: "var(--font-impact)" }}
        >
          MEME STUDIO
        </h1>
        <QueryErrorNotice error={q.error} onRetry={() => q.refetch()} />
      </main>
    );
  }
  if (me.isLoading || status.isLoading) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <p className="text-[#64748B]">Memuat…</p>
      </main>
    );
  }
  if (!me.data) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 p-8">
        <h1
          className="text-4xl uppercase"
          style={{ fontFamily: "var(--font-impact)" }}
        >
          MEME STUDIO
        </h1>
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-[#E2E8F0]">
          <p className="text-sm text-[#64748B]">
            Anda harus masuk untuk mengakses studio.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button asChild className="rounded-xl bg-[#0F172A] text-white hover:bg-black">
              <Link href="/login">Masuk</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="rounded-xl border-[#E2E8F0]"
            >
              <Link href="/register">Daftar</Link>
            </Button>
          </div>
        </div>
      </main>
    );
  }
  if (!subscribed) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 p-8">
        <h1
          className="text-4xl uppercase"
          style={{ fontFamily: "var(--font-impact)" }}
        >
          MEME STUDIO
        </h1>
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-[#EF4444]/40">
          <p className="text-sm text-[#64748B]">
            Studio hanya untuk pelanggan. Berlangganan dulu untuk membuat meme.
          </p>
          <Button
            asChild
            className="mt-4 rounded-xl bg-[#0F172A] text-white hover:bg-black"
          >
            <Link href="/pricing">Pilih Paket</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-10 p-6 md:p-8">
      {/* Header + kuota meter */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#0F172A]" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
              Studio
            </span>
          </div>
          <h1
            className="text-[40px] leading-[44px] uppercase tracking-[0.03em] text-[#0F172A]"
            style={{ fontFamily: "var(--font-impact)" }}
          >
            MEME STUDIO
          </h1>
        </div>
        {quotaLeft !== null && quotaTotal !== null && (
          <div className="flex items-center gap-4 rounded-xl bg-white p-3 pl-4 shadow-sm ring-1 ring-[#E2E8F0]">
            <div className="flex min-w-[150px] flex-col">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold text-[#64748B]">
                  Sisa Kuota Akun
                </span>
                <span className="text-xs font-bold text-[#0F172A]">
                  {quotaLeft} / {quotaTotal}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#E2E8F0]">
                <div
                  className="h-full rounded-full bg-[#0F172A] transition-all duration-500"
                  style={{
                    width: `${Math.round((quotaLeft / quotaTotal) * 100)}%`,
                  }}
                />
              </div>
            </div>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="rounded-lg border-[#E2E8F0]"
            >
              <Link href="/pricing">
                <Zap className="mr-1 size-3.5" />
                Upgrade
              </Link>
            </Button>
          </div>
        )}
      </div>

      {/* Split layout: kontrol kiri, preview kanan */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        {/* Kiri: form */}
        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-[#E2E8F0]"
        >
          <div className="space-y-2">
            <Label
              htmlFor="title"
              className="text-xs font-semibold text-[#0F172A]"
            >
              Judul
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Meme hari ini"
              className="rounded-xl border-[#E2E8F0] focus-visible:border-[#0F172A] focus-visible:ring-[#0F172A]/10"
            />
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="image"
              className="text-xs font-semibold text-[#0F172A]"
            >
              Gambar Dasar
            </Label>
            <label
              htmlFor="image"
              className="group flex h-32 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-xl bg-[#F2F4F6] transition-colors hover:bg-[#ECEEF0]"
            >
              <span className="text-xs font-semibold text-[#0F172A]">
                {fileName || "Pilih gambar atau template"}
              </span>
              <span className="text-[11px] text-[#64748B]">
                PNG, JPG, WEBP dari perangkat Anda
              </span>
            </label>
            <input
              id="image"
              type="file"
              accept="image/*"
              ref={fileRef}
              className="sr-only"
              onChange={() => {
                const file = fileRef.current?.files?.[0];
                if (!file) return;
                setFileName(file.name);
                const img = new Image();
                img.onload = () => {
                  imgRef.current = img;
                  renderPreview();
                };
                img.src = URL.createObjectURL(file);
              }}
            />
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="top"
              className="text-xs font-semibold text-[#0F172A]"
            >
              Teks Atas
            </Label>
            <Input
              id="top"
              value={top}
              onChange={(e) => setTop(e.target.value)}
              placeholder="WHEN THE SCAFFOLD"
              className="rounded-xl border-[#E2E8F0] uppercase focus-visible:border-[#0F172A] focus-visible:ring-[#0F172A]/10"
            />
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="bottom"
              className="text-xs font-semibold text-[#0F172A]"
            >
              Teks Bawah
            </Label>
            <Input
              id="bottom"
              value={bottom}
              onChange={(e) => setBottom(e.target.value)}
              placeholder="BUILDS ON THE FIRST TRY"
              className="rounded-xl border-[#E2E8F0] uppercase focus-visible:border-[#0F172A] focus-visible:ring-[#0F172A]/10"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label
                htmlFor="font-size"
                className="text-xs font-semibold text-[#0F172A]"
              >
                Ukuran Font
              </Label>
              <span className="rounded-full bg-[#F1F5F9] px-2.5 py-0.5 text-[10px] font-bold text-[#334155]">
                {fontSize}px
              </span>
            </div>
            <div
              role="group"
              aria-label="Preset ukuran font"
              className="flex items-center gap-3"
            >
              <input
                id="font-size"
                type="range"
                min={0}
                max={FONT_SIZES.length - 1}
                step={1}
                value={FONT_SIZES.indexOf(fontSize)}
                onChange={(e) =>
                  setFontSize(FONT_SIZES[Number(e.target.value)])
                }
                aria-valuetext={`${fontSize}px`}
                className="font-size-slider flex-1"
              />
            </div>
            <div className="flex justify-between text-[10px] font-semibold text-[#94A3B8]">
              <span>{FONT_SIZES[0]}px</span>
              <span>{FONT_SIZES[FONT_SIZES.length - 1]}px</span>
            </div>
            <p className="text-[11px] text-[#64748B]">
              Ukuran teks Impact pada hasil render (dasar kanvas 800px).
            </p>
          </div>

          {error && <p className="text-sm text-[#EF4444]">{error}</p>}

          <Button
            type="submit"
            disabled={busy || prepare.isPending}
            className="mt-2 h-12 w-full rounded-xl bg-[#0F172A] text-sm font-bold uppercase tracking-wider text-white shadow-md transition-all hover:bg-black active:scale-[0.99]"
          >
            {busy ? "Memproses…" : "Render & Simpan Meme"}
          </Button>
        </form>

        {/* Kanan: preview live */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col rounded-2xl bg-white p-4 shadow-sm ring-1 ring-[#E2E8F0]">
            <div className="mb-3 flex items-center justify-between border-b border-[#F2F4F6] pb-3">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                  Real-Time Visualizer
                </span>
              </div>
              <span className="font-mono text-[10px] text-[#94A3B8]">
                AUTO FIT
              </span>
            </div>
            <div
              className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-[#F2F4F6] shadow-inner"
              style={{
                backgroundImage:
                  "radial-gradient(#94A3B8 0.75px, transparent 0.75px)",
                backgroundSize: "12px 12px",
              }}
            >
              <canvas
                id="meme-canvas"
                className="max-h-full max-w-full rounded-xl"
              />
              {!imgRef.current && !fileName && (
                <p className="absolute text-xs text-[#64748B]">
                  Pilih gambar dasar untuk melihat preview
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Galeri Meme Saya */}
      <section className="space-y-4 rounded-2xl bg-[#F2F4F6] p-6 md:p-8">
        <div className="flex flex-col justify-between gap-2 border-b border-[#E2E8F0] pb-4 sm:flex-row sm:items-end">
          <div>
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
              Arsip Galeri
            </span>
            <h2
              className="text-[32px] leading-[36px] uppercase text-[#0F172A]"
              style={{ fontFamily: "var(--font-impact)" }}
            >
              MEME SAYA
            </h2>
          </div>
          <span className="text-xs text-[#64748B]">
            {memes.data?.items?.length ?? 0} meme tersimpan
          </span>
        </div>
        {memes.isError && (
          <QueryErrorNotice
            error={memes.error}
            onRetry={() => memes.refetch()}
          />
        )}
        {memes.data?.items?.length ? (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {memes.data.items.map((m) => (
              <li
                key={m.id}
                className="group flex flex-col overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-[#E2E8F0] transition-all hover:-translate-y-1 hover:shadow-md"
              >
                <div className="relative aspect-square w-full overflow-hidden bg-[#ECEEF0]">
                  {m.resultUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.resultUrl}
                      alt={m.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-[#94A3B8]">
                      (belum dirender)
                    </div>
                  )}
                  {m.resultUrl && (
                    <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 backdrop-blur-[2px] transition-opacity duration-200 group-hover:opacity-100">
                      <a
                        href={m.resultUrl}
                        download
                        target="_blank"
                        rel="noreferrer"
                        title="Unduh"
                        className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-[#0F172A] transition-colors hover:bg-[#0F172A] hover:text-white"
                      >
                        <Download className="size-4" />
                      </a>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between p-3">
                  <p className="truncate text-xs font-bold text-[#0F172A]">
                    {m.title || "(tanpa judul)"}
                  </p>
                  <span className="shrink-0 text-[10px] text-[#94A3B8]">
                    {new Date(m.createdAt).toLocaleDateString("id-ID")}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          !memes.isError && (
            <p className="text-sm text-[#64748B]">
              Belum ada meme. Render meme pertamamu di atas.
            </p>
          )
        )}
      </section>
    </main>
  );
}
