"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { persistToken } from "@/lib/auth/client";

const API_BASE_URL = "/api/auth";

function buildErrorMessage(response, fallback, serverMessage) {
  const rawMessage = serverMessage?.toString?.() ?? "";
  if (rawMessage && /[\u4e00-\u9fa5]/.test(rawMessage)) {
    return rawMessage;
  }

  const normalized = rawMessage.toLowerCase().trim();
  if (normalized) {
    if (normalized.includes("invalid captcha") || normalized.includes("captcha")) {
      return "验证码错误";
    }
    if (normalized.includes("username and password are required")) {
      return "请填写完整的登录信息";
    }
    if (normalized.includes("failed authentication") || normalized.includes("unauthorized")) {
      return "用户名或密码不正确";
    }
  }

  if (!response) {
    return fallback;
  }
  if (response.status === 401) {
    return "用户名或密码不正确";
  }
  if (response.status === 400) {
    return normalized || "请填写完整的登录信息";
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
    // no-op
  }

  try {
    return await response.clone().text();
  } catch (error) {
    return "";
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [values, setValues] = useState({ username: "", password: "" });
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

    try {
      const response = await fetch(`${API_BASE_URL}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          username: values.username.trim(),
          password: values.password,
          captcha_id: captcha.id,
          captcha_answer: captchaAnswer.trim(),
        }),
      });

      if (!response.ok) {
        const serverMessage = await extractServerMessage(response);
        const fallback = `登录失败，${response.status}`;
        const message = buildErrorMessage(response, fallback, serverMessage);
        throw new Error(message);
      }

      const data = await response.json();
      const token = data?.token;
      if (!token) {
        throw new Error("登录成功，但未返回凭证");
      }

      persistToken(token, data?.expire);
      setSuccess("登录成功，即将跳转...");
      setTimeout(() => {
        router.replace("/");
        router.refresh();
      }, 600);
    } catch (caught) {
      const message = caught?.message ?? "登录失败";
      setError(message);
      loadCaptcha();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100 px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-slate-200/60 bg-white/80 p-8 shadow-2xl backdrop-blur">
        <h1 className="text-2xl font-semibold text-slate-900">登录 Auralis</h1>
        <p className="mt-2 text-sm text-slate-500">使用账号密码登录以访问你的主页。</p>

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
            <label htmlFor="password" className="block text-sm font-medium text-slate-600">
              密码
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={6}
              value={values.password}
              onChange={handleChange}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              placeholder="请输入密码"
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
                placeholder="请输入验证码"
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
            </div>
            <p className="text-xs text-slate-500">
              {captcha.image ? "无法识别可点击图片刷新验证码" : "请点击刷新获取验证码"}
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
            {submitting ? "登录中..." : "登录"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          还没有账号？
          <Link href="/register" className="ml-1 font-medium text-blue-500 hover:text-blue-600">
            去注册
          </Link>
        </p>
      </div>
    </div>
  );
}
