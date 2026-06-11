import React from "react";

const confidenceClasses = {
  danger: "border border-rose-400 text-rose-400 bg-slate-900/70",
  warning: "border border-orange-300 text-orange-300 bg-slate-900/70",
  medium: "border border-amber-300 text-amber-300 bg-slate-900/70",
  success: "border border-emerald-400 text-emerald-400 bg-slate-900/70",
};

export const ConfidenceBadge = ({ score }) => {
  if (score === undefined || score === null || score === "") {
    return <span className="text-muted-foreground">-</span>;
  }

  const value = typeof score === "number" ? score : parseFloat(score);
  if (Number.isNaN(value)) {
    return <span className="text-muted-foreground">-</span>;
  }

  const percent = Math.round(value * 100);
  const tone =
    percent >= 80
      ? confidenceClasses.success
      : percent >= 60
        ? confidenceClasses.medium
        : percent >= 40
          ? confidenceClasses.warning
          : confidenceClasses.danger;

  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-md text-sm font-semibold ${tone}`}>
      {percent}%
    </span>
  );
};

export const PredictionBadge = ({ label }) => {
  const isBenign = String(label).toLowerCase().includes("benign");
  const tone = isBenign ? confidenceClasses.success : confidenceClasses.danger;

  return (
    <span className={`inline-flex items-center px-4 py-1 rounded-full text-sm font-semibold ${tone}`}>
      {label || "unknown"}
    </span>
  );
};

export default PredictionBadge;
