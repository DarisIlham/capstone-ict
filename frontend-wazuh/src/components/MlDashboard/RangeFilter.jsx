import React from "react";
import { TIME_RANGE_OPTIONS } from "./utils";

export default function RangeFilter({ rangeKey, onRangeChange }) {
  return (
    <div className="flex items-center gap-1 md:gap-2">
      <span className="text-xs text-slate-500 hidden sm:inline">Range</span>
      <div className="flex bg-slate-800 rounded p-0.5 border border-slate-700 gap-0.5">
        {TIME_RANGE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onRangeChange(option.value)}
            className={`px-1.5 md:px-2.5 py-0.5 md:py-1 text-xs rounded-sm ${rangeKey === option.value ? "bg-sky-600 text-white" : "text-slate-400"}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
