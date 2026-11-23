// Halaman depan PUBLIK — jangan redirect otomatis ke /login.
// Desain mengikuti docs/ui_redesign/preview_studio_beranda_meme_portal.
import Link from "next/link";
import { ArrowRight, Zap, LayoutGrid, CloudUpload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LandingMemePreview } from "@/components/landing-meme-preview";

const FEATURES = [
  {
    icon: Zap,
    title: "Ekspor Resolusi Tinggi",
    desc: "Meme diekspor dalam format jernih tanpa pixel pecah, siap tempur di semua linimasa media sosial.",
  },
  {
    icon: LayoutGrid,
    title: "Template Populer",
    desc: "Koleksi template mengikuti tren meme global maupun lokal agar leluconmu selalu segar.",
  },
  {
    icon: CloudUpload,
    title: "Simpan Cloud Tanpa Ribet",
    desc: "Karya tersimpan aman di akunmu dan bisa diakses dari desktop maupun smartphone.",
  },
];

export default function Home() {
  return (
    <main className="flex-1 bg-[#F8FAFC]">
      {/* Hero */}
      <section className="mx-auto max-w-7xl px-6 pt-16 pb-12 md:pt-24">
        <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
          <span className="mb-6 inline-flex items-center gap-2 rounded-full bg-[#ECEEF0] px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#45464D]">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#0F172A]" />
            Studio Meme Online
          </span>
          <h1
            className="text-[36px] leading-[40px] tracking-[0.02em] text-[#0F172A] uppercase md:text-[56px] md:leading-[60px]"
            style={{ fontFamily: "var(--font-impact)" }}
          >
            Bikin Meme Berkualitas Dalam Hitungan Detik.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-[#64748B]">
            Editor meme tercepat, mudah digunakan, dan siap dibagikan ke mana
            saja. Upload gambar dasar, tulis punchline, dan render langsung
            dari browser.
          </p>
          <div className="mt-8 flex w-full flex-wrap items-center justify-center gap-3 sm:w-auto">
            <Button
              asChild
              size="lg"
              className="h-12 rounded-xl bg-[#0F172A] px-6 text-sm font-semibold text-white shadow-md transition-transform hover:bg-black hover:scale-[1.02] active:scale-[0.98]"
            >
              <Link href="/studio">
                <Zap className="mr-1 size-4" />
                Mulai Buat Meme
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-12 rounded-xl border-[#E2E8F0] bg-white px-6 text-sm font-semibold text-[#0F172A] hover:border-[#0F172A] hover:bg-[#F8FAFC]"
            >
              <Link href="#meme-populer">
                Lihat Contoh
                <ArrowRight className="ml-1 size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Pratinjau — satu gambar meme statis sebagai contoh hasil */}
      <section id="meme-populer" className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-8 text-center">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
            Mode Pratinjau
          </span>
          <h2
            className="text-[28px] leading-[32px] text-[#0F172A] uppercase md:text-[32px] md:leading-[36px]"
            style={{ fontFamily: "var(--font-impact)" }}
          >
            Contoh Hasil Meme
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#64748B]">
            Begini tampilan meme yang dirender langsung dari studio — teks
            Impact klasik dengan outline tebal.
          </p>
        </div>
        <LandingMemePreview />
      </section>

      {/* Fitur */}
      <section className="mx-auto max-w-7xl px-6 py-12">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
            Didesain Untuk Kreator Cepat
          </span>
          <h2
            className="text-[28px] leading-[32px] text-[#0F172A] uppercase md:text-[32px] md:leading-[36px]"
            style={{ fontFamily: "var(--font-impact)" }}
          >
            Kenapa Bikin Meme Di Sini?
          </h2>
          <p className="mt-2 text-sm text-[#64748B]">
            Hilangkan proses edit rumit di aplikasi berat. Buat punchline,
            pilih gambar, dan bagikan langsung ke linimasa.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="flex flex-col rounded-2xl bg-white p-6 shadow-sm ring-1 ring-[#E2E8F0] transition-shadow hover:shadow-md"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#0F172A] text-white">
                <f.icon className="size-6" />
              </div>
              <h3 className="mb-2 text-lg font-bold text-[#0F172A]">
                {f.title}
              </h3>
              <p className="text-sm leading-relaxed text-[#64748B]">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA bawah */}
      <section className="mx-auto max-w-7xl px-6 pb-16 pt-4">
        <div className="relative flex flex-col items-center justify-between gap-6 overflow-hidden rounded-3xl bg-[#0F172A] p-8 text-white shadow-2xl md:flex-row md:p-12">
          <div
            className="pointer-events-none absolute -bottom-10 -right-8 select-none text-[160px] leading-none uppercase opacity-10"
            style={{ fontFamily: "var(--font-impact)" }}
          >
            MEME
          </div>
          <div className="relative z-10 max-w-xl text-center md:text-left">
            <span className="mb-2 inline-block text-[10px] font-bold uppercase tracking-widest text-[#CBD5E1]">
              Mulai Tanpa Kartu Kredit
            </span>
            <h2
              className="text-[32px] leading-[36px] uppercase md:text-[56px] md:leading-[60px]"
              style={{ fontFamily: "var(--font-impact)" }}
            >
              Siap Bikin Meme Viralmu?
            </h2>
            <p className="mt-2 max-w-md text-sm text-[#CBD5E1]">
              Bergabunglah dengan kreator lain hari ini. Daftar, pilih paket,
              dan langsung render meme pertamamu.
            </p>
          </div>
          <div className="relative z-10 flex w-full flex-col gap-3 sm:flex-row md:w-auto">
            <Button
              asChild
              size="lg"
              className="h-12 rounded-xl bg-white px-8 text-sm font-semibold text-[#0F172A] shadow-lg transition-transform hover:scale-105 hover:bg-[#F1F5F9]"
            >
              <Link href="/register">Daftar Sekarang</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-12 rounded-xl border-white/30 bg-transparent px-6 text-sm font-semibold text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="/login">Masuk Akun</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#E2E8F0] py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-6 text-xs text-[#64748B] sm:flex-row">
          <span
            className="text-sm uppercase tracking-wider text-[#0F172A]"
            style={{ fontFamily: "var(--font-impact)" }}
          >
            MEME PORTAL
          </span>
          <p>© {new Date().getFullYear()} Meme Portal. Bikin meme, bukan drama.</p>
        </div>
      </footer>
    </main>
  );
}
