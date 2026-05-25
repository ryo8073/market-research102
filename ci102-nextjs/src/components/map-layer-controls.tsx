"use client";

import { NLNI_LAYERS, type NlniLayerId } from "@/lib/use-nlni-overlay";

interface Props {
  activeLayers: Set<NlniLayerId>;
  onToggle: (layerId: NlniLayerId) => void;
}

export default function MapLayerControls({ activeLayers, onToggle }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {NLNI_LAYERS.map((layer) => {
        const active = activeLayers.has(layer.id);
        return (
          <button
            key={layer.id}
            onClick={() => onToggle(layer.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors
              ${active ? "bg-slate-800 text-white border-slate-800" : "bg-white hover:bg-slate-50"}`}
          >
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{
                backgroundColor: layer.color,
                opacity: active ? 1 : 0.4,
              }}
            />
            {layer.label}
          </button>
        );
      })}
    </div>
  );
}
