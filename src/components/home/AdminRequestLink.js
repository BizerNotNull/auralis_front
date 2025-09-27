"use client";

import { useCallback, useMemo, useState } from "react";

export function AdminRequestLink({ userId, username, disabled = false, className = "" }) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  const disabledOrPending = disabled || pending;

  const buttonClassName = useMemo(() => {
    const base = [
      "inline-flex",
      "items-center",
      "text-sm",
      "font-medium",
      "transition",
      "duration-150",
      "focus:outline-none",
    ];

    if (disabledOrPending) {
      base.push("text-slate-400", "cursor-not-allowed", "hover:text-slate-400");
    } else {
      base.push("text-blue-500", "hover:text-blue-600");
    }

    return base.join(" ");
  }, [disabledOrPending]);

  const statusMessage = useMemo(() => {
    if (result === "success") {
      return { text: "申请已发送", tone: "text-green-600" };
    }
    if (result === "error" && errorMessage) {
      return { text: errorMessage, tone: "text-red-500" };
    }
    return null;
  }, [errorMessage, result]);

  const handleClick = useCallback(async () => {
    if (disabled || pending) {
      return;
    }

    setPending(true);
    setResult(null);
    setErrorMessage("");

    try {
      const response = await fetch("/api/auth/admin-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "home_footer",
          user_id: userId ?? undefined,
          username: username ?? undefined,
        }),
      });

      if (!response.ok) {
        let detail = "";
        try {
          const data = await response.json();
          detail = data?.message || data?.error || "";
        } catch (error) {
          detail = "";
        }
        throw new Error(detail || "申请发送失败");
      }

      setResult("success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "申请发送失败";
      setErrorMessage(message);
      setResult("error");
    } finally {
      setPending(false);
    }
  }, [disabled, pending, userId, username]);

  const containerClasses = useMemo(() => {
    const classes = ["inline-flex", "items-center", "gap-2"];
    if (className) {
      classes.push(className);
    }
    return classes.join(" ");
  }, [className]);

  return (
    <span className={containerClasses}>
      <button
        type="button"
        className={buttonClassName}
        onClick={handleClick}
        disabled={disabledOrPending}
        aria-disabled={disabledOrPending}
      >
        成为管理员
      </button>
      <span className="text-sm text-slate-500">
        注:需要管理员账号请直接 admin 123456 因为这个按钮的实现方式是给开发者本人发邮件
      </span>
    </span>
  );
}
