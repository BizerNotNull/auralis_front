"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

const API_BASE_URL = "/api/auth";
const TOKEN_STORAGE_KEYS = ["access_token", "token", "authToken", "jwt"];

function pickStoredToken() {
  if (typeof window === "undefined") {
    return null;
  }

  for (const key of TOKEN_STORAGE_KEYS) {
    try {
      const value = window.localStorage?.getItem?.(key);
      if (value) {
        return value;
      }
    } catch (error) {
      // ignore storage errors
    }
  }

  return null;
}

function normalizeTokenValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }

  return Math.round(numeric);
}

export default function TokenPurchasePage() {
  const router = useRouter();
  const [tokenBalance, setTokenBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [purchaseAmount, setPurchaseAmount] = useState(1000);
  const [purchaseStatus, setPurchaseStatus] = useState({
    loading: false,
    error: "",
    success: "",
  });

  const loadBalance = useCallback(async () => {
    setLoading(true);
    setError("");

    const token = pickStoredToken();
    if (!token) {
      setLoading(false);
      setError("请先登录后再查看 Token 余额。");
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/me`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });

      if (response.status === 401) {
        setError("登录状态已失效，请重新登录。");
        setTokenBalance(null);
        return;
      }

      if (!response.ok) {
        throw new Error(`获取余额失败（${response.status}）`);
      }

      const data = await response.json().catch(() => null);
      const user = data?.user ?? null;
      if (!user) {
        throw new Error("未能解析用户信息");
      }

      const balance = normalizeTokenValue(
        user?.token_balance ?? user?.tokenBalance,
      );
      setTokenBalance(balance);
    } catch (caught) {
      setError(caught?.message ?? "获取 Token 余额失败");
      setTokenBalance(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBalance();
  }, [loadBalance]);

  const formattedTokenBalance = useMemo(() => {
    if (tokenBalance === null || tokenBalance === undefined) {
      return null;
    }

    const numeric = Number(tokenBalance);
    if (Number.isFinite(numeric)) {
      return numeric.toLocaleString();
    }

    return String(tokenBalance);
  }, [tokenBalance]);

  const handleSelectPurchaseAmount = (amount) => {
    setPurchaseAmount(amount);
    setPurchaseStatus((prev) =>
      prev.loading ? prev : { loading: false, error: "", success: "" },
    );
  };

  const handlePurchaseSubmit = async (event) => {
    event?.preventDefault?.();

    const amount = Math.round(Number(purchaseAmount));
    if (!Number.isFinite(amount) || amount <= 0) {
      setPurchaseStatus({
        loading: false,
        error: "请输入有效的购买数量",
        success: "",
      });
      return;
    }

    const token = pickStoredToken();
    if (!token) {
      setPurchaseStatus({
        loading: false,
        error: "请先登录后再购买 Token",
        success: "",
      });
      return;
    }

    setPurchaseStatus({ loading: true, error: "", success: "" });

    try {
      const response = await fetch(`${API_BASE_URL}/tokens/purchase`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
        body: JSON.stringify({ amount }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          data?.error ?? data?.message ?? `购买失败（${response.status}）`;
        setPurchaseStatus({ loading: false, error: message, success: "" });
        return;
      }

      const balance = normalizeTokenValue(
        data?.token_balance ?? data?.tokenBalance,
      );
      setTokenBalance(balance);

      setPurchaseStatus({
        loading: false,
        error: "",
        success: `成功增加 ${amount.toLocaleString()} Token`,
      });
    } catch (caught) {
      setPurchaseStatus({
        loading: false,
        error: caught?.message ?? "购买失败，请稍后重试",
        success: "",
      });
    }
  };

  const handleBackToProfile = () => {
    try {
      router.push("/me");
    } catch (error) {
      if (typeof window !== "undefined") {
        window.location.href = "/me";
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-2xl rounded-3xl border border-slate-200/60 bg-white/85 p-8 shadow-2xl backdrop-blur">
        <header className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              购买 Token
            </h1>
            <p className="text-sm text-slate-500">
              Token 用于驱动智能对话，余额不足时将无法继续发送消息。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={loadBalance}
              disabled={loading || purchaseStatus.loading}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-blue-400 hover:text-blue-500 disabled:cursor-not-allowed disabled:text-slate-300"
            >
              {loading ? "刷新中..." : "刷新余额"}
            </button>
            <button
              type="button"
              onClick={handleBackToProfile}
              className="rounded-full border border-blue-200 px-4 py-2 text-sm font-medium text-blue-600 transition hover:border-blue-400 hover:text-blue-500"
            >
              返回个人信息
            </button>
          </div>
        </header>

        <main className="mt-6 space-y-6">
          <section className="rounded-3xl border border-slate-100 bg-white/90 p-6 shadow">
            <div
              className={`rounded-2xl border px-4 py-3 text-center text-slate-700 ${
                tokenBalance === 0
                  ? "border-red-200 bg-red-50 text-red-600"
                  : "border-slate-200 bg-slate-50"
              }`}
            >
              <span className="block text-xs text-slate-400">当前余额</span>
              <span className="text-3xl font-semibold">
                {formattedTokenBalance ?? "加载中"}
              </span>
            </div>

            {error ? (
              <p className="mt-4 text-sm text-red-500">{error}</p>
            ) : null}

            <form
              onSubmit={handlePurchaseSubmit}
              className="mt-6 flex flex-col gap-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                {[1000, 5000, 10000].map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => handleSelectPurchaseAmount(option)}
                    className={`rounded-full border px-4 py-2 text-sm transition ${
                      purchaseAmount === option
                        ? "border-amber-400 bg-amber-50 text-amber-600"
                        : "border-slate-200 bg-white text-slate-600 hover:border-amber-300 hover:text-amber-600"
                    }`}
                  >
                    +{option.toLocaleString()} Token
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <label
                  className="text-sm font-medium text-slate-600"
                  htmlFor="purchase-amount-input"
                >
                  自定义数量
                </label>
                <input
                  id="purchase-amount-input"
                  type="number"
                  min={1}
                  value={purchaseAmount}
                  onChange={(event) => {
                    setPurchaseAmount(Number(event.target.value));
                    setPurchaseStatus((prev) =>
                      prev.loading
                        ? prev
                        : { loading: false, error: "", success: "" },
                    );
                  }}
                  className="w-full max-w-xs rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 shadow focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
                />
                <button
                  type="submit"
                  disabled={purchaseStatus.loading}
                  className="rounded-full bg-amber-500 px-5 py-2 text-sm font-medium text-white shadow transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-amber-300"
                >
                  {purchaseStatus.loading ? "处理中..." : "购买Token"}
                </button>
              </div>

              {purchaseStatus.error ? (
                <p className="text-sm text-red-500">{purchaseStatus.error}</p>
              ) : null}

              {purchaseStatus.success ? (
                <p className="text-sm text-emerald-600">
                  {purchaseStatus.success}
                </p>
              ) : null}
            </form>
          </section>

          <section className="rounded-3xl border border-slate-100 bg-white/80 p-6 text-sm text-slate-600 shadow">
            <h2 className="text-base font-semibold text-slate-900">使用说明</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>
                Token 会在每次与智能体对话时根据输入和回复的长度自动扣除。
              </li>
              <li>可以快速选择常用 Token 数量或输入自定义数值进行充值。</li>
              <li>购买完成后余额会立即更新，如未刷新可点击“刷新余额”。</li>
            </ul>
          </section>
        </main>
      </div>
    </div>
  );
}
