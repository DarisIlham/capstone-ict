import React, { useState } from "react";
import { CalendarDays } from "lucide-react";
import {
  createDefaultDateRange,
  getDateRangeError,
} from "../utils/dateRange";

const PRESET_OPTIONS = [
  { label: "1 Hari", days: 1, title: "1 hari terakhir" },
  { label: "1 Minggu", days: 7, title: "1 minggu terakhir" },
  { label: "1 Bulan", days: 30, title: "1 bulan terakhir" },
];

export default function DateRangeFilter({
  value,
  onChange,
  disabled = false,
  className = "",
  twoRows = false,
}) {
  const [activePreset, setActivePreset] = useState(PRESET_OPTIONS[0].label);
  const error = getDateRangeError(value);

  const applyPreset = (preset) => {
    setActivePreset(preset.label);
    onChange(createDefaultDateRange(preset.days));
  };

  const updateField = (field, nextValue) => {
    setActivePreset(null);

    const nextRange = {
      start: value?.start || "",
      end: value?.end || "",
      [field]: nextValue,
    };

    const startTime = new Date(nextRange.start).getTime();
    const endTime = new Date(nextRange.end).getTime();

    if (Number.isFinite(startTime) && Number.isFinite(endTime) && startTime > endTime) {
      if (field === "start") {
        nextRange.end = nextValue;
      } else {
        nextRange.start = nextValue;
      }
    }

    onChange(nextRange);
  };

  const dateIcon = (
    <div className="flex h-9 items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 whitespace-nowrap">
      <CalendarDays className="h-5 w-5 text-slate-400" />
      <span className="text-sm text-slate-400">Date</span>
    </div>
  );

  const presetGroup = (
    <div className="flex h-9 items-center gap-0.5 rounded-lg border border-slate-700 bg-slate-800 p-0.5">
      {PRESET_OPTIONS.map((option) => (
        <button
          key={option.label}
          type="button"
          title={option.title}
          disabled={disabled}
          onClick={() => applyPreset(option)}
          className={`h-7 rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
            activePreset === option.label
              ? "bg-sky-600 text-white"
              : "text-slate-400 hover:bg-slate-700 hover:text-slate-200"
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );

  const fromInput = (
    <label className="flex items-center gap-1.5 text-xs text-slate-400 whitespace-nowrap">
      <span>From</span>
      <input
        type="datetime-local"
        value={value?.start || ""}
        max={value?.end || undefined}
        disabled={disabled}
        onChange={(event) => updateField("start", event.target.value)}
        className="h-9 rounded border border-slate-700 bg-slate-800 px-2 text-xs text-slate-100 focus:border-sky-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />
    </label>
  );

  const toInput = (
    <label className="flex items-center gap-1.5 text-xs text-slate-400 whitespace-nowrap">
      <span>To</span>
      <input
        type="datetime-local"
        value={value?.end || ""}
        min={value?.start || undefined}
        disabled={disabled}
        onChange={(event) => updateField("end", event.target.value)}
        className="h-9 rounded border border-slate-700 bg-slate-800 px-2 text-xs text-slate-100 focus:border-sky-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />
    </label>
  );

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {twoRows ? (
        <>
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            {dateIcon}
            {presetGroup}
          </div>
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            {fromInput}
            {toInput}
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          {dateIcon}
          {presetGroup}
          {fromInput}
          {toInput}
        </div>
      )}

      {error && <div className="text-[11px] text-red-300">{error}</div>}
    </div>
  );
}
