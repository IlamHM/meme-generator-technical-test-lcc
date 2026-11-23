"use client";

// Demo interaktif landing: pratinjau meme live murni client-side (useState).
// TIDAK ada API call / penyimpanan — hanya contoh hasil render studio.
// Layout meniru studio: satu card, kontrol kiri + preview kanan seimbang.

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const FONT_SIZES = [24, 32, 40, 48, 56, 64, 72];
const DEFAULT_FONT_SIZE = 48;

// Gaya teks meme klasik: putih kapital, outline hitam tebal (sama seperti
// hasil render canvas studio).
const memeTextStyle: React.CSSProperties = {
  fontFamily: "var(--font-impact)",
  WebkitTextStroke: "2px #000",
  textShadow:
    "2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000",
};

export function LandingMemePreview() {
  const [top, setTop] = useState("WHEN THE SCAFFOLD");
  const [bottom, setBottom] = useState("BUILDS ON THE FIRST TRY");
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);

  // Skala ukuran relatif terhadap lebar kolom preview (48px di kanvas ~800px).
  const previewSize = `clamp(14px, ${(fontSize / 800) * 100 * 1.6}vw, ${fontSize}px)`;

  return (
    <div className="mx-auto max-w-5xl rounded-2xl bg-white p-4 shadow-xl ring-1 ring-[#E2E8F0] md:p-6">
      <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
        {/* Kolom kiri: kontrol demo */}
        <div className="flex flex-col gap-4">
          <div className="space-y-2">
            <Label
              htmlFor="demo-top"
              className="text-xs font-semibold uppercase tracking-wider text-[#0F172A]"
            >
              Teks Atas
            </Label>
            <Input
              id="demo-top"
              value={top}
              onChange={(e) => setTop(e.target.value)}
              placeholder="WHEN THE SCAFFOLD"
              className="rounded-xl border-[#E2E8F0] uppercase focus-visible:border-[#0F172A] focus-visible:ring-[#0F172A]/10"
            />
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="demo-bottom"
              className="text-xs font-semibold uppercase tracking-wider text-[#0F172A]"
            >
              Teks Bawah
            </Label>
            <Input
              id="demo-bottom"
              value={bottom}
              onChange={(e) => setBottom(e.target.value)}
              placeholder="BUILDS ON THE FIRST TRY"
              className="rounded-xl border-[#E2E8F0] uppercase focus-visible:border-[#0F172A] focus-visible:ring-[#0F172A]/10"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label
                htmlFor="demo-font-size"
                className="text-xs font-semibold uppercase tracking-wider text-[#0F172A]"
              >
                Ukuran Font
              </Label>
              <span className="rounded-full bg-[#F1F5F9] px-2.5 py-0.5 text-[10px] font-bold text-[#334155]">
                {fontSize}px
              </span>
            </div>
            <input
              id="demo-font-size"
              type="range"
              min={0}
              max={FONT_SIZES.length - 1}
              step={1}
              value={FONT_SIZES.indexOf(fontSize)}
              onChange={(e) => setFontSize(FONT_SIZES[Number(e.target.value)])}
              aria-valuetext={`${fontSize}px`}
              className="font-size-slider w-full"
            />
            <div className="flex justify-between text-[10px] font-semibold text-[#94A3B8]">
              <span>{FONT_SIZES[0]}px</span>
              <span>{FONT_SIZES[FONT_SIZES.length - 1]}px</span>
            </div>
          </div>
          <div className="mt-auto rounded-xl bg-[#F2F4F6] px-4 py-3">
            <p className="text-[11px] text-[#64748B]">
              Demo interaktif — tidak disimpan. Hasil asli dirender di Meme
              Studio.
            </p>
          </div>
        </div>

        {/* Kolom kanan: preview live */}
        <div className="flex flex-col overflow-hidden rounded-xl ring-1 ring-[#E2E8F0]">
          <div className="flex items-center justify-between border-b border-[#F2F4F6] px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                Contoh Render Studio
              </span>
            </div>
            <span className="rounded-full bg-[#F1F5F9] px-2.5 py-0.5 text-[10px] font-bold text-[#334155]">
              Mode Pratinjau
            </span>
          </div>
          <div className="relative min-h-[280px] w-full flex-1 bg-[#E2E8F0] lg:min-h-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/meme-placeholder.png"
              alt="Contoh hasil meme dari Meme Studio"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-x-4 top-4 text-center">
              <p
                className="uppercase leading-none tracking-wider break-words text-white"
                style={{ ...memeTextStyle, fontSize: previewSize }}
              >
                {top}
              </p>
            </div>
            <div className="pointer-events-none absolute inset-x-4 bottom-4 text-center">
              <p
                className="uppercase leading-none tracking-wider break-words text-white"
                style={{ ...memeTextStyle, fontSize: previewSize }}
              >
                {bottom}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
