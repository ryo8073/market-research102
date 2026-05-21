"use client";

import dynamic from "next/dynamic";
import type { PlotParams } from "react-plotly.js";

const Plot = dynamic(() => import("react-plotly.js"), {
  ssr: false,
  loading: () => (
    <div className="h-[400px] animate-pulse bg-muted rounded-lg" />
  ),
});

export default function PlotlyChart(props: PlotParams) {
  const title =
    typeof props.layout?.title === "string"
      ? props.layout.title
      : typeof props.layout?.title === "object" && props.layout.title?.text
        ? props.layout.title.text
        : "データチャート";

  return (
    <div role="img" aria-label={title}>
      <Plot
        {...props}
        useResizeHandler
        style={{ width: "100%", ...props.style }}
        config={{ responsive: true, displayModeBar: false, ...props.config }}
      />
    </div>
  );
}
