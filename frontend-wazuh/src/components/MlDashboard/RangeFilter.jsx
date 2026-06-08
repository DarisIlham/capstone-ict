import React from "react";
import { TIME_RANGE_OPTIONS } from "./utils";

export default function RangeFilter({ rangeKey, onRangeChange }) {
  return (
    <div className="flex items-center gap-1 md:gap-2">
      <span className="hidden text-xs text-muted-foreground transition-colors sm:inline">Range</span>
      <div className="app-toggle-group">
        {TIME_RANGE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onRangeChange(option.value)}
            className={`app-toggle-option ${rangeKey === option.value ? "app-toggle-option-active" : ""}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
