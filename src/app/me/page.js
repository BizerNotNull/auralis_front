/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const API_BASE_URL = "/api/auth";
const TOKEN_STORAGE_KEYS = ["access_token", "token", "authToken", "jwt"];

const ROLE_LABELS = {
  admin: "\u7BA1\u7406\u5458",
  staff: "\u56E2\u961F\u6210\u5458",
  user: "\u666E\u901A\u7528\u6237",
};

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

function clearStoredTokens() {
  if (typeof window === "undefined") {
    return;
  }

  for (const key of TOKEN_STORAGE_KEYS) {
    try {
      window.localStorage?.removeItem?.(key);
    } catch (error) {
      // ignore storage errors
    }
    try {
      window.sessionStorage?.removeItem?.(key);
    } catch (error) {
      // ignore storage errors
    }
    if (typeof document !== "undefined") {
      try {
        document.cookie = `${key}=; Max-Age=0; path=/;`;
      } catch (error) {
        // ignore cookie errors
      }
    }
  }
}

function sanitizePayload(values) {
  const payload = {};
  if (typeof values.nickname === "string") {
    payload.nickname = values.nickname.trim();
  }
  if (typeof values.display_name === "string") {
    payload.display_name = values.display_name.trim();
  }
  if (typeof values.email === "string") {
    payload.email = values.email.trim();
  }
  if (typeof values.avatar_url === "string") {
    payload.avatar_url = values.avatar_url.trim();
  }
  if (typeof values.bio === "string") {
    payload.bio = values.bio.trim();
  }
  return payload;
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

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [tokenBalance, setTokenBalance] = useState(null);
  const [purchaseAmount, setPurchaseAmount] = useState(1000);
  const [purchaseStatus, setPurchaseStatus] = useState({
    loading: false,
    error: "",
    success: "",
  });
  const [formValues, setFormValues] = useState({
    display_name: "",
    nickname: "",
    email: "",
    avatar_url: "",
    bio: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [unauthorized, setUnauthorized] = useState(false);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [avatarError, setAvatarError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const fileInputRef = useRef(null);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const token = pickStoredToken();
      if (!token) {
        setUnauthorized(true);
        setProfile(null);
        setTokenBalance(null);
        setPurchaseStatus({ loading: false, error: "", success: "" });
        setPurchaseAmount(1000);
        return;
      }

      const response = await fetch(`${API_BASE_URL}/me`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });

      if (response.status === 401) {
        setUnauthorized(true);
        setProfile(null);
        setTokenBalance(null);
        setPurchaseStatus({ loading: false, error: "", success: "" });
        setPurchaseAmount(1000);
        return;
      }

      if (!response.ok) {
        throw new Error(`加载个人信息失败（${response.status}）`);
      }

      const data = await response.json().catch(() => null);
      const user = data?.user ?? null;
      if (!user) {
        throw new Error("未获取到个人信息");
      }

      setProfile(user);

      const balance = normalizeTokenValue(
        user?.token_balance ?? user?.tokenBalance,
      );

      setTokenBalance(balance);
      setPurchaseStatus({ loading: false, error: "", success: "" });

      setFormValues({
        display_name: user?.display_name ?? "",
        nickname: user?.nickname ?? "",
        email: user?.email ?? "",
        avatar_url: user?.avatar_url ?? "",
        bio: user?.bio ?? "",
      });
      setAvatarPreview((prev) => {
        if (prev && typeof window !== "undefined") {
          URL.revokeObjectURL(prev);
        }
        return "";
      });
      setAvatarFile(null);
      setAvatarError("");
      setUnauthorized(false);
    } catch (caught) {
      setError(caught?.message ?? "加载失败");
      setTokenBalance(null);
      setPurchaseStatus({ loading: false, error: "", success: "" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(
    () => () => {
      if (avatarPreview && typeof window !== "undefined") {
        URL.revokeObjectURL(avatarPreview);
      }
    },
    [avatarPreview],
  );

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setAvatarError("");

    const trimmedDisplayName = (formValues.display_name ?? "").trim();
    const trimmedNickname = (formValues.nickname ?? "").trim();
    const trimmedEmail = (formValues.email ?? "").trim();

    if (!trimmedNickname) {
      setError("请输入昵称");
      return;
    }
    if (!trimmedDisplayName) {
      setError("请输入展示昵称");
      return;
    }
    if (!trimmedEmail) {
      setError("请输入电子邮箱地址");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("请输入有效的电子邮箱地址");
      return;
    }

    setSaving(true);

    try {
      const token = pickStoredToken();
      if (!token) {
        setUnauthorized(true);
        throw new Error("请先登录后再更新信息");
      }

      let nextValues = {
        ...formValues,
        display_name: trimmedDisplayName,
        nickname: trimmedNickname,
        email: trimmedEmail,
      };

      if (avatarFile) {
        const formData = new FormData();
        formData.append("avatar", avatarFile);

        const avatarResponse = await fetch(`${API_BASE_URL}/me/avatar`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
          cache: "no-store",
        });

        if (avatarResponse.status === 401) {
          setUnauthorized(true);
          throw new Error("登录状态已过期，请重新登录");
        }

        if (!avatarResponse.ok) {
          let message = `上传失败，${avatarResponse.status}。`;
          try {
            const payload = await avatarResponse.clone().json();
            message = payload?.error ?? payload?.message ?? message;
          } catch (jsonError) {
            try {
              const fallback = await avatarResponse.clone().text();
              message = fallback || message;
            } catch (textError) {
              // ignore
            }
          }
          setAvatarError(message);
          throw new Error(message);
        }

        const avatarData = await avatarResponse.json().catch(() => null);
        const avatarUser = avatarData?.user ?? null;
        if (!avatarUser) {
          const message = "上传成功但未返回用户信息";
          setAvatarError(message);
          throw new Error(message);
        }

        nextValues = {
          ...nextValues,
          avatar_url: avatarUser?.avatar_url ?? "",
        };
        setProfile(avatarUser);
      }

      const response = await fetch(`${API_BASE_URL}/me`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
        body: JSON.stringify(sanitizePayload(nextValues)),
      });

      if (response.status === 401) {
        setUnauthorized(true);
        throw new Error("登录状态已过期，请重新登录");
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message =
          payload?.error ??
          payload?.message ??
          `更新失败，${response.status}。`;
        throw new Error(message);
      }

      const data = await response.json().catch(() => null);
      const user = data?.user ?? null;

      if (user) {
        setProfile(user);
        setFormValues({
          display_name: user?.display_name ?? "",
          nickname: user?.nickname ?? "",
          email: user?.email ?? "",
          avatar_url: user?.avatar_url ?? "",
          bio: user?.bio ?? "",
        });
      } else {
        setFormValues({
          display_name: nextValues.display_name ?? "",
          nickname: nextValues.nickname ?? "",
          email: nextValues.email ?? "",
          avatar_url: nextValues.avatar_url ?? "",
          bio: nextValues.bio ?? "",
        });
      }

      if (avatarPreview && typeof window !== "undefined") {
        URL.revokeObjectURL(avatarPreview);
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setAvatarPreview("");
      setAvatarFile(null);

      setSuccess("更新成功");
    } catch (caught) {
      setError(caught?.message ?? "更新失败");
    } finally {
      setSaving(false);
    }
  };

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
    } catch (error) {
      setPurchaseStatus({
        loading: false,
        error: error?.message ?? "购买失败，请稍后重试",
        success: "",
      });
    }
  };

  const handleAvatarFileChange = (event) => {
    setAvatarError("");
    const file = event.target.files?.[0] ?? null;
    if (avatarPreview && typeof window !== "undefined") {
      URL.revokeObjectURL(avatarPreview);
    }

    if (file && typeof window !== "undefined") {
      const previewURL = URL.createObjectURL(file);
      setAvatarPreview(previewURL);
    } else {
      setAvatarPreview("");
    }

    setAvatarFile(file);
  };

  const handleAvatarButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleLogout = async () => {
    if (loggingOut) {
      return;
    }

    setLoggingOut(true);
    setError("");
    setSuccess("");
    setAvatarError("");

    try {
      const token = pickStoredToken();
      if (token) {
        try {
          await fetch(`${API_BASE_URL}/logout`, {
            method: "POST",
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
            credentials: "include",
          });
        } catch (logoutError) {
          // ignore logout failures
        }
      }
    } finally {
      clearStoredTokens();
      setProfile(null);
      setTokenBalance(null);
      setPurchaseStatus({ loading: false, error: "", success: "" });
      setPurchaseAmount(1000);
      setFormValues({
        display_name: "",
        nickname: "",
        email: "",
        avatar_url: "",
        bio: "",
      });
      setAvatarFile(null);
      if (avatarPreview && typeof window !== "undefined") {
        URL.revokeObjectURL(avatarPreview);
      }
      setAvatarPreview("");
      setAvatarError("");
      setUnauthorized(true);
      setLoggingOut(false);

      try {
        router.replace("/");
      } catch (navigationError) {
        if (typeof window !== "undefined") {
          window.location.href = "/";
        }
      }
    }
  };

  const primaryDisplayName =
    formValues.nickname ||
    profile?.nickname ||
    formValues.display_name ||
    profile?.display_name ||
    profile?.username ||
    "未登录";

  const accountUsername = profile?.username ?? "未登录";
  const accountEmail = formValues.email || profile?.email || "未填写";

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

  const avatarAlt = primaryDisplayName
    ? `${primaryDisplayName}头像`
    : "用户头像";
  const displayAvatar =
    avatarPreview || formValues.avatar_url || profile?.avatar_url || "";

  const initialLetter = useMemo(() => {
    const name = primaryDisplayName || "用户";
    return name.slice(0, 1).toUpperCase();
  }, [primaryDisplayName]);

  const roleBadges = useMemo(() => {
    if (!Array.isArray(profile?.roles)) {
      return [];
    }

    const labels = [];
    const seen = new Set();

    for (const role of profile.roles) {
      if (typeof role !== "string") {
        continue;
      }
      const normalized = role.trim();
      if (!normalized) {
        continue;
      }
      const key = normalized.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const pretty = normalized
        .split(/[_\s-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
      const label = (ROLE_LABELS[key] ?? pretty) || normalized;
      labels.push(label);
    }

    return labels;
  }, [profile?.roles]);

  const isAdmin = useMemo(() => {
    return (
      Array.isArray(profile?.roles) &&
      profile.roles.some(
        (role) => typeof role === "string" && role.toLowerCase() === "admin",
      )
    );
  }, [profile?.roles]);

  if (unauthorized) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100 px-6 py-10 text-slate-700">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white/80 p-8 text-center shadow-2xl backdrop-blur">
          <h1 className="text-2xl font-semibold text-slate-900">请先登录</h1>
          <p className="mt-3 text-sm text-slate-500">
            登录后即可管理你的个人资料与专属智能体。
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <Link
              href="/login"
              className="w-full rounded-full bg-blue-500 px-5 py-3 text-sm font-medium text-white shadow transition hover:bg-blue-600"
            >
              立即登录
            </Link>
            <Link
              href="/register"
              className="w-full rounded-full border border-slate-200 px-5 py-3 text-sm font-medium text-slate-600 transition hover:border-blue-400 hover:text-blue-500"
            >
              注册新账号
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-3xl rounded-3xl border border-slate-200/60 bg-white/80 p-8 shadow-2xl backdrop-blur">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">个人主页</h1>
            <p className="text-sm text-slate-500">
              编辑头像、昵称和介绍，展示你的个性化身份。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={loadProfile}
              disabled={loading || loggingOut}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-blue-400 hover:text-blue-500 disabled:cursor-not-allowed disabled:text-slate-300"
            >
              {loading ? "刷新中..." : "刷新"}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-500 transition hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loggingOut ? "退出中..." : "退出登录"}
            </button>
          </div>
        </header>

        <main className="mt-6">
          <section className="mb-6 flex flex-col gap-6 rounded-3xl border border-slate-100 bg-white/90 p-6 shadow">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Token余额
                </h2>
                <p className="text-sm text-slate-500">
                  聊天将消耗 Token，余额耗尽后需要充值才能继续。
                </p>
              </div>

              <div
                className={`rounded-2xl border px-4 py-2 text-right ${
                  tokenBalance === 0
                    ? "border-red-200 bg-red-50 text-red-600"
                    : "border-slate-200 bg-slate-50 text-slate-700"
                }`}
              >
                <span className="block text-xs text-slate-400">当前余额</span>
                <span className="text-xl font-semibold">
                  {formattedTokenBalance ?? "加载中"}
                </span>
              </div>
            </div>

            <form
              onSubmit={handlePurchaseSubmit}
              className="flex flex-col gap-4"
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
                  htmlFor="token-purchase-amount"
                >
                  自定义数量
                </label>
                <input
                  id="token-purchase-amount"
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
          <section className="flex flex-col gap-6 rounded-3xl border border-slate-100 bg-white/90 p-6 shadow">
            <div className="flex items-center gap-4">
              {displayAvatar ? (
                <img
                  src={displayAvatar}
                  alt={avatarAlt}
                  className="h-20 w-20 rounded-3xl object-cover"
                />
              ) : (
                <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-blue-100 text-2xl font-semibold text-blue-500">
                  {initialLetter}
                </span>
              )}
              <div>
                <h2 className="text-xl font-semibold text-slate-900">
                  {primaryDisplayName}
                </h2>
                <div className="mt-1 flex flex-col gap-1 text-xs text-slate-500 sm:flex-row sm:items-center sm:gap-4">
                  <span>用户名：{accountUsername}</span>
                  <span>电子邮箱：{accountEmail}</span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {roleBadges.length > 0 ? (
                    roleBadges.map((role) => (
                      <span
                        key={role}
                        className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-600"
                      >
                        {role}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-slate-500">
                      {ROLE_LABELS.user}
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-400">
                  加入时间：{profile?.created_at ?? profile?.createdAt ?? "--"}
                </p>
                {isAdmin ? (
                  <Link
                    href="/admin"
                    className="mt-2 inline-flex items-center justify-center rounded-full border border-blue-200 px-3 py-1 text-xs font-medium text-blue-600 transition hover:bg-blue-50"
                  >
                    进入管理后台
                  </Link>
                ) : null}
              </div>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="grid gap-2">
                <label
                  htmlFor="nickname"
                  className="text-sm font-medium text-slate-600"
                >
                  昵称
                </label>
                <input
                  id="nickname"
                  name="nickname"
                  type="text"
                  required
                  minLength={1}
                  value={formValues.nickname}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="请输入昵称"
                />
              </div>

              <div className="grid gap-2">
                <label
                  htmlFor="email"
                  className="text-sm font-medium text-slate-600"
                >
                  电子邮箱
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={formValues.email}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="请输入有效的邮箱"
                />
              </div>

              <div className="grid gap-2">
                <label
                  htmlFor="display_name"
                  className="text-sm font-medium text-slate-600"
                >
                  昵称
                </label>
                <input
                  id="display_name"
                  name="display_name"
                  type="text"
                  required
                  minLength={1}
                  value={formValues.display_name}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="请输入展示昵称"
                />
              </div>

              <div className="grid gap-2">
                <span className="text-sm font-medium text-slate-600">头像</span>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  {displayAvatar ? (
                    <img
                      src={displayAvatar}
                      alt={avatarAlt}
                      className="h-20 w-20 rounded-3xl object-cover"
                    />
                  ) : (
                    <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-blue-100 text-2xl font-semibold text-blue-500">
                      {initialLetter}
                    </span>
                  )}
                  <div className="flex-1 space-y-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarFileChange}
                      className="hidden"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleAvatarButtonClick}
                        disabled={saving}
                        className="rounded-full bg-blue-500 px-4 py-2 text-sm font-medium text-white shadow transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-blue-300"
                      >
                        上传新头像
                      </button>
                    </div>

                    {avatarFile ? (
                      <p className="text-xs text-slate-500">
                        待上传：{avatarFile.name}（
                        {Math.round(avatarFile.size / 1024)} KB）
                      </p>
                    ) : null}
                    {avatarError ? (
                      <p className="text-xs text-red-500">{avatarError}</p>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="grid gap-2">
                <label
                  htmlFor="bio"
                  className="text-sm font-medium text-slate-600"
                >
                  个人简介
                </label>
                <textarea
                  id="bio"
                  name="bio"
                  rows={4}
                  value={formValues.bio}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="用几句话介绍你自己或你的智能体故事"
                />
              </div>

              {error ? (
                <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {error}
                </p>
              ) : null}

              {success ? (
                <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-600">
                  {success}
                </p>
              ) : null}

              <div className="flex items-center justify-end gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-full bg-blue-500 px-5 py-3 text-sm font-medium text-white shadow transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-blue-300"
                >
                  {saving ? "保存中..." : "保存信息"}
                </button>
              </div>
            </form>
          </section>

          {loading ? (
            <p className="mt-6 text-center text-sm text-slate-400">
              正在加载个人信息...
            </p>
          ) : null}
        </main>
      </div>
    </div>
  );
}
