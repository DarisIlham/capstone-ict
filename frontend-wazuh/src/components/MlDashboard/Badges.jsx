import React from "react";

const confidenceClasses = {
  danger: "border border-red-500/30 bg-red-500/12 text-red-700 dark:text-red-300",
  warning: "border border-orange-500/30 bg-orange-500/12 text-orange-700 dark:text-orange-300",
  medium: "border border-amber-500/30 bg-amber-500/12 text-amber-700 dark:text-amber-300",
  success: "border border-emerald-500/30 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
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

  return <span className={`app-badge ${tone}`}>{percent}%</span>;
};

export const PredictionBadge = ({ label }) => {
  const isBenign = String(label).toLowerCase().includes("benign");
  const tone = isBenign ? confidenceClasses.success : confidenceClasses.danger;

  return <span className={`app-badge ${tone}`}>{label || "unknown"}</span>;
};

export default PredictionBadge;
