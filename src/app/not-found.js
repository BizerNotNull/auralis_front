import Image from "next/image";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 bg-slate-950 px-6 py-16 text-slate-100">
      <div className="space-y-3 text-center">
        <p className="text-sm uppercase tracking-[0.3em] text-blue-400">404</p>
        <h1 className="text-3xl font-semibold sm:text-4xl">Oops, this star went missing</h1>
        <p className="text-sm text-slate-400 sm:text-base">
          The page you were looking for drifted away. Stay a while and listen to a tune from Auralis.
        </p>
      </div>

      <Image
        src="/auralis/auralis.jpg"
        alt="Auralis artwork"
        width={280}
        height={280}
        priority
        className="h-60 w-60 rounded-3xl border border-slate-800 object-cover shadow-xl shadow-blue-900/40"
      />

      <audio
        controls
        preload="metadata"
        className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-4 text-slate-200 shadow-inner shadow-slate-900/40"
      >
        <source src="/auralis/auralis.m4a" type="audio/mp4" />
        <source src="/auralis/auralis.m4a" type="audio/x-m4a" />
        Your browser does not support the audio element.
      </audio>

      <Link
        href="/"
        className="rounded-full border border-transparent bg-blue-500 px-6 py-2 text-sm font-medium text-white shadow transition hover:bg-blue-400"
      >
        Go back home
      </Link>
    </main>
  );
}
