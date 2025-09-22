import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8">
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/next.svg"
              alt="Auralis"
              width={120}
              height={28}
              priority
            />
            <span className="hidden text-lg font-semibold sm:inline">
              Auralis 智能体平台
            </span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 sm:flex">
            <Link
              href="/smart/create"
              className="rounded-full border border-blue-200 px-5 py-3 text-sm font-medium text-blue-600 transition hover:border-blue-400 hover:text-blue-500"
            >
              创建智能体
            </Link>
            <Link href="#features" className="hover:text-slate-900">
              功能亮点
            </Link>
            <Link href="/smart" className="hover:text-slate-900">
              智能体
            </Link>
            <Link href="#docs" className="hover:text-slate-900">
              文档
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/register"
              className="hidden rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-blue-400 hover:text-blue-500 sm:inline"
            >
              注册
            </Link>
            <Link
              href="/login"
              className="rounded-full bg-blue-500 px-5 py-2 text-sm font-medium text-white shadow transition hover:bg-blue-600"
            >
              登录
            </Link>
          </div>
        </header>

        <main className="flex flex-1 flex-col justify-center">
          <section className="grid items-center gap-12 py-16 md:grid-cols-2">
            <div className="space-y-6">
              <p className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-4 py-1 text-xs font-medium text-blue-600">
                智能体实时互动
              </p>
              <h1 className="text-4xl font-bold leading-tight tracking-tight text-slate-900 sm:text-5xl">
                连接你的数字伙伴，开启沉浸式智能对话新体验
              </h1>
              <p className="text-base text-slate-600">
                使用 Auralis，你可以为每一个场景快速创建专属智能体，拥有 Live2D
                动态形象、语音识别和上下文记忆能力，随时随地为你提供协助。
              </p>
              <div className="flex flex-wrap gap-4">
                <Link
                  href="/smart/demo"
                  className="rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white shadow transition hover:bg-slate-700"
                >
                  立即体验
                </Link>
                <Link
                  href="#features"
                  className="rounded-full border border-slate-200 px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-blue-400 hover:text-blue-500"
                >
                  查看功能
                </Link>
              </div>
            </div>
            <div className="relative flex justify-center">
              <div
                className="absolute inset-0 -translate-y-6 scale-110 rounded-full bg-blue-100 opacity-60 blur-3xl"
                aria-hidden
              />
              <Image
                src="/vercel.svg"
                alt="Platform preview"
                width={360}
                height={360}
                className="relative z-10"
                priority
              />
            </div>
          </section>

          <section
            id="features"
            className="grid gap-6 rounded-3xl border border-slate-200 bg-white/80 p-8 shadow-xl backdrop-blur md:grid-cols-3"
          >
            {[
              {
                title: "多模态互动",
                description:
                  "结合语音识别、文本与 Live2D 可视化呈现，为用户提供沉浸式对话体验。",
              },
              {
                title: "上下文记忆",
                description:
                  "自动调用历史消息和用户画像，让智能体始终理解当前上下文。",
              },
              {
                title: "快速集成",
                description:
                  "统一 API 接口与组件化封装，几分钟即可嵌入你的业务系统。",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-slate-100 bg-white/90 p-6 shadow-lg"
              >
                <h3 className="text-lg font-semibold text-slate-900">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm text-slate-500">
                  {item.description}
                </p>
              </div>
            ))}
          </section>
        </main>

        <footer
          id="docs"
          className="mt-12 border-t border-slate-200 pt-6 text-sm text-slate-500"
        >
          <p>
            Copyright {new Date().getFullYear()} Auralis.
            构建属于你的智能体宇宙。
          </p>
        </footer>
      </div>
    </div>
  );
}
