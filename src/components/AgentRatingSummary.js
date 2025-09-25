"use client";

function StarIcon({ className = "", title = "" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      role="img"
      aria-hidden={title ? undefined : true}
      aria-label={title || undefined}
      className={`shrink-0 ${className}`}
      fill="currentColor"
    >
      <path d="M12 2.5l2.89 6.02 6.67.55-5.04 4.46 1.5 6.47L12 16.96l-6.02 3.04 1.5-6.47-5.04-4.46 6.67-.55L12 2.5z" />
    </svg>
  );
}

const SIZE_STYLES = {
  sm: {
    container:
      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs",
    icon: "h-3.5 w-3.5",
    count: "text-[10px]",
  },
  md: {
    container:
      "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm",
    icon: "h-4 w-4",
    count: "text-xs",
  },
  lg: {
    container:
      "inline-flex items-center gap-2.5 rounded-full px-3.5 py-2 text-base",
    icon: "h-5 w-5",
    count: "text-sm",
  },
};

export default function AgentRatingSummary({
  average,
  count,
  size = "md",
  className = "",
}) {
  const sizeStyles = SIZE_STYLES[size] ?? SIZE_STYLES.md;
  const avgValue = Number(average ?? 0);
  const safeAverage = Number.isFinite(avgValue) ? avgValue : 0;
  const displayAverage = Math.round(safeAverage * 10) / 10;
  const roundedDisplay = displayAverage.toFixed(1);
  const rawCount = Number(count ?? 0);
  const safeCount =
    Number.isFinite(rawCount) && rawCount > 0 ? Math.floor(rawCount) : 0;

  if (safeCount === 0) {
    return (
      <div
        className={`${sizeStyles.container} bg-gray-100 text-gray-400 ${className}`.trim()}
        title="暂无评分"
      >
        <StarIcon className={sizeStyles.icon} title="暂无评分" />
        <span className="font-medium">暂无评分</span>
      </div>
    );
  }

  const summaryLabel = `平均评分 ${roundedDisplay}，共有 ${safeCount} 条评价`;

  return (
    <div
      className={`${sizeStyles.container} bg-amber-50 text-amber-600 ${className}`.trim()}
      title={summaryLabel}
    >
      <StarIcon className={`${sizeStyles.icon} text-amber-500`} title="评分" />
      <span className="font-semibold">{roundedDisplay}</span>
      <span className={`${sizeStyles.count} text-amber-500/80`}>
        {safeCount} 条评分
      </span>
    </div>
  );
}
