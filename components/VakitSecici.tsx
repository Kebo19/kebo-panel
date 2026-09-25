"use client";

import type { SayimVakti } from "@/lib/stok";

/** Sayımın sabah (gün başı) mı akşam (gün sonu) mı yapıldığını seçtirir. */
export default function VakitSecici({ value, onChange }: { value: SayimVakti; onChange: (v: SayimVakti) => void }) {
  return (
    <div>
      <label className="block text-[10px] text-gray-600 uppercase font-medium mb-1">Sayım saati</label>
      <div className="grid grid-cols-2 gap-1.5">
        {([["sabah", "Sabah (açılış)"], ["aksam", "Akşam (kapanış)"]] as const).map(([v, l]) => (
          <button key={v} type="button" onClick={() => onChange(v)}
            className={`text-xs font-semibold py-2 rounded-lg border transition-colors ${value === v ? "bg-blue-600 text-white border-blue-600" : "bg-[#f7f8fa] border-[#e2e5eb] text-gray-600"}`}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}
