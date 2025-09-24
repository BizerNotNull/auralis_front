import Link from "next/link";

const adminEntries = [
  {
    title: "Live2D 模型管理",
    description: "上传新的 Live2D 模型、查看历史版本并维护素材资源。",
    href: "/admin/live2d",
    action: "进入模型管理",
  },
  {
    title: "智能体管理",
    description: "维护智能体配置、上架或下线及绑定 Live2D 模型。",
    href: "/admin/agents",
    action: "进入智能体管理",
  },
];

export default function AdminHomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-12 lg:px-10">
        <header className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-500">
              Auralis Admin
            </p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">
              管理控制台
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-slate-500">
              这里汇总了仅限管理员的功能入口，帮助你快速跳转到 Live2D 模型上传、
              智能体管理等核心模块。
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-4 py-2 text-xs text-blue-500 shadow-sm">
            <span className="hidden sm:inline">仅管理员可见</span>
            <span className="font-medium">Admin Only</span>
          </div>
        </header>

        <main className="flex-1">
          <section className="grid gap-6 sm:grid-cols-2">
            {adminEntries.map((entry) => (
              <Link
                key={entry.href}
                href={entry.href}
                className="group relative flex h-full flex-col justify-between rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-lg backdrop-blur transition hover:border-blue-300 hover:shadow-xl"
              >
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-blue-400">
                    管理模块
                  </p>
                  <h2 className="mt-4 text-xl font-semibold text-slate-900">
                    {entry.title}
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-slate-500">
                    {entry.description}
                  </p>
                </div>
                <span className="mt-6 inline-flex items-center justify-between rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition group-hover:bg-slate-700">
                  {entry.action}
                  <svg
                    className="ml-2 h-3 w-3"
                    viewBox="0 0 12 12"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M3 2.5L8.5 2.5V8"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M8.5 2.5L2.5 8.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </Link>
            ))}
          </section>

          <section className="mt-10 rounded-3xl border border-dashed border-slate-200 bg-white/70 p-6 text-sm text-slate-500">
            <h2 className="text-base font-semibold text-slate-700">
              后续扩展
            </h2>
            <p className="mt-2">
              如果需要新增日志审计、系统配置等管理模块，可在这里补充卡片，保持统一的入口体验。
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
