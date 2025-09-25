"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const API_BASE_URL = "/api/auth";

function mapError(response, fallback, serverMessage) {
  const rawMessage = serverMessage?.toString?.() ?? "";
  if (rawMessage && /[\u4e00-\u9fa5]/.test(rawMessage)) {
    return rawMessage;
  }

  const normalized = rawMessage.toLowerCase().trim();
  if (normalized) {
    if (normalized.includes("invalid captcha") || normalized.includes("captcha")) {
      return "验证码错误";
    }
    if (normalized.includes("username already exists")) {
      return "该用户名已存在";
    }
    if (normalized.includes("invalid email")) {
      return "请输入有效的电子邮箱地址";
    }
    if (
      normalized.includes("email already exists") ||
      normalized.includes("email already in use") ||
      normalized.includes("email already exist")
    ) {
      return "该邮箱已被占用";
    }
    if (normalized.includes("password")) {
      return "密码不符合要求";
    }
  }

  if (!response) {
    return fallback;
  }
  if (response.status === 409) {
    return "该用户名已存在";
  }
  if (response.status === 400) {
    return normalized || "用户名或密码不满足要求";
  }
  return fallback;
}

async function extractServerMessage(response) {
  try {
    const payload = await response.clone().json();
    if (payload && typeof payload === "object") {
      return payload.error ?? payload.message ?? "";
    }
  } catch (error) {
    // ignore
  }

  try {
    return await response.clone().text();
  } catch (error) {
    return "";
  }
}

export default function RegisterPage() {
  const router = useRouter();
  const [values, setValues] = useState({ username: "", nickname: "", email: "", password: "" });
  const [captcha, setCaptcha] = useState({ id: "", image: "", expiresAt: "", loading: false });
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [captchaError, setCaptchaError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadCaptcha = useCallback(async () => {
    setCaptcha((prev) => ({ ...prev, loading: true }));
    setCaptchaError("");

    try {
      const response = await fetch("/api/auth/captcha", {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`获取验证码失败，${response.status}`);
      }

      const data = await response.json();
      const id = data?.captcha_id ?? "";
      const rawImage = typeof data?.image_base64 === "string" ? data.image_base64.trim() : "";
      const image = rawImage && !rawImage.startsWith("data:") ? `data:image/png;base64,${rawImage}` : rawImage;
      const expiresAt = data?.expires_at ?? "";
      if (!id || !image) {
        throw new Error("获取验证码失败");
      }

      setCaptcha({ id, image, expiresAt, loading: false });
      setCaptchaAnswer("");
    } catch (caught) {
      setCaptcha({ id: "", image: "", expiresAt: "", loading: false });
      setCaptchaAnswer("");
      setCaptchaError(caught?.message ?? "验证码刷新失败");
    }
  }, []);

  useEffect(() => {
    loadCaptcha();
  }, [loadCaptcha]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleCaptchaChange = (event) => {
    setCaptchaAnswer(event.target.value);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);

    if (!captcha.id) {
      setError("验证码已失效，请点击刷新后重试");
      setSubmitting(false);
      loadCaptcha();
      return;
    }
    if (!captchaAnswer.trim()) {
      setError("请输入验证码");
      setSubmitting(false);
      return;
    }

    const trimmedUsername = values.username.trim();
    const trimmedNickname = values.nickname.trim();
    const trimmedEmail = values.email.trim();

    if (!trimmedUsername) {
      setError("请输入用户名");
      setSubmitting(false);
      return;
    }
    if (!trimmedNickname) {
      setError("请输入昵称");
      setSubmitting(false);
      return;
    }
    if (!trimmedEmail) {
      setError("请输入电子邮箱地址");
      setSubmitting(false);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("请输入有效的电子邮箱地址");
      setSubmitting(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          username: trimmedUsername,
          nickname: trimmedNickname,
          email: trimmedEmail,
          password: values.password,
          captcha_id: captcha.id,
          captcha_answer: captchaAnswer.trim(),
        }),
      });

      if (!response.ok) {
        const serverMessage = await extractServerMessage(response);
        const fallback = `注册失败，${response.status}`;
        throw new Error(mapError(response, fallback, serverMessage));
      }

      await response.json().catch(() => null);
      setSuccess("注册成功，请前往登录");
      setTimeout(() => {
        router.push("/login");
      }, 800);
    } catch (caught) {
      const message = caught?.message ?? "注册失败";
      setError(message);
      loadCaptcha();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100 px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-slate-200/60 bg-white/80 p-8 shadow-2xl backdrop-blur">
        <h1 className="text-2xl font-semibold text-slate-900">注册账号</h1>
        <p className="mt-2 text-sm text-slate-500">创建账号后即可管理你的专属智能体。</p>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label htmlFor="username" className="block text-sm font-medium text-slate-600">
              用户名
            </label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              required
              value={values.username}
              onChange={handleChange}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              placeholder="请输入用户名"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="nickname" className="block text-sm font-medium text-slate-600">
              昵称
            </label>
            <input
              id="nickname"
              name="nickname"
              type="text"
              autoComplete="nickname"
              required
              value={values.nickname}
              onChange={handleChange}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              placeholder="请输入昵称"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm font-medium text-slate-600">
              电子邮箱
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={values.email}
              onChange={handleChange}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              placeholder="请输入电子邮箱地址"
            />
          </div>


          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm font-medium text-slate-600">
              密码
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={values.password}
              onChange={handleChange}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              placeholder="至少 6 位密码"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="captcha" className="block text-sm font-medium text-slate-600">
              验证码
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                id="captcha"
                name="captcha"
                type="text"
                required
                minLength={1}
                value={captchaAnswer}
                onChange={handleCaptchaChange}
                className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                placeholder="?????????"
              />
              <button
                type="button"
                onClick={loadCaptcha}
                disabled={captcha.loading || submitting}
                className="flex h-12 w-28 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="刷新验证码"
              >
                {captcha.image ? (
                  <Image
                    src={captcha.image}
                    alt="验证码"
                    width={160}
                    height={60}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    unoptimized
                  />
                ) : (
                  <span className="text-xs text-slate-400">
                    {captcha.loading ? "加载中..." : "待刷新"}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={loadCaptcha}
                disabled={captcha.loading || submitting}
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-blue-400 hover:text-blue-500 disabled:cursor-not-allowed disabled:text-slate-300"
              >
                {captcha.loading ? "?????..." : "????????"}
              </button>
            </div>
            <p className="text-xs text-slate-500">
              {captcha.image ? "请输入图片中的字符，无法识别可刷新" : "请点击刷新获取验证码"}
            </p>
            {captchaError ? (
              <p className="text-xs text-red-500">{captchaError}</p>
            ) : null}
          </div>

          {error ? (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
          ) : null}

          {success ? (
            <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-600">{success}</p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-2xl bg-blue-500 px-4 py-3 text-sm font-medium text-white shadow transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {submitting ? "注册中..." : "注册"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          已经有账号？
          <Link href="/login" className="ml-1 font-medium text-blue-500 hover:text-blue-600">
            去登录
          </Link>
        </p>
      </div>
    </div>
  );
}
