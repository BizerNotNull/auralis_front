"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { persistToken } from "@/lib/auth/client";

const API_BASE_URL = "/api/auth";

function buildErrorMessage(response, fallback) {
  if (!response) {
    return fallback;
  }
  if (response.status === 401) {
    return "用户名或密码错误";
  }
  if (response.status === 400) {
    return "请填写完整的登录信息";
  }
  return fallback;
}

export default function LoginPage() {
  const router = useRouter();
  const [values, setValues] = useState({ username: "", password: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleChange = (event) => {
    const { name, value } = event.target;
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);

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
        }),
      });

      if (!response.ok) {
        const fallback = `登录失败：${response.status}`;
        const message = buildErrorMessage(response, fallback);
        throw new Error(message);
      }

      const data = await response.json();
      const token = data?.token;
      if (!token) {
        throw new Error("登录成功但未返回令牌");
      }

      persistToken(token, data?.expire);
      setSuccess("登录成功，正在跳转...");
      setTimeout(() => {
        router.replace("/");
        router.refresh();
      }, 600);
    } catch (caught) {
      const message = caught?.message ?? "登录失败";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100 px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-slate-200/60 bg-white/80 p-8 shadow-2xl backdrop-blur">
        <h1 className="text-2xl font-semibold text-slate-900">登录 Auralis</h1>
        <p className="mt-2 text-sm text-slate-500">使用账号密码登录以访问智能体页面。</p>

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
              placeholder="输入用户名"
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
              placeholder="输入密码"
            />
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
