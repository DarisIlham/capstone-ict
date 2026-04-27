import React from "react";
import Navbar from "../components/Navbar";

export default function Alert() {
  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xl font-semibold text-white">Alert</div>
              <div className="text-sm text-slate-400">Overview</div>
            </div>

            <div className="flex items-center gap-2">
              <button className="inline-flex items-center gap-2 rounded-md bg-sky-600 px-4 py-2 text-white hover:bg-sky-700">
                Refresh
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-slate-700/60 bg-slate-800/50 p-4">
            <div className="text-slate-300 text-sm mb-3">This page shows alerts and notifications. Implement alert feeds and filtering here.</div>

            <div className="overflow-hidden rounded-lg border border-slate-700/60 bg-slate-800/50">
              <div className="p-6 text-slate-400">No alerts to display.</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
