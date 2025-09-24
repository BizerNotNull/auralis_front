import Link from "next/link";

export const metadata = {
  title: "Unauthorized",
};

export default function UnauthorizedPage() {
  return (
    <section className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 py-16">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white/90 p-10 text-center shadow-xl backdrop-blur-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-500">401</p>
        <h1 className="mt-4 text-2xl font-bold text-slate-900">Unauthorized</h1>
        <p className="mt-3 text-sm text-slate-600">
          You need to sign in before you can access this page. Please log in and then try again.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/login"
            className="rounded-full bg-blue-500 px-6 py-3 text-sm font-medium text-white shadow transition hover:bg-blue-600"
          >
            Go to Login
          </Link>
          <Link
            href="/"
            className="rounded-full border border-slate-200 px-6 py-3 text-sm font-medium text-slate-700 transition hover:border-blue-400 hover:text-blue-500"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </section>
  );
}
