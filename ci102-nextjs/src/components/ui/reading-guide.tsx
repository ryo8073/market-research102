"use client";

/**
 * 3-step reading guide for charts.
 * Placed below each chart to help clients understand the data.
 */

interface Step {
  title: string;
  description: string;
}

interface ReadingGuideProps {
  steps: [Step, Step, Step];
}

const STEP_COLORS = ["#2A9D8F", "#D4A843", "#1B2A4A"];

export function ReadingGuide({ steps }: ReadingGuideProps) {
  return (
    <div className="rounded-xl border bg-muted/30 p-4">
      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">このチャートの読み方</p>
      <div className="grid sm:grid-cols-3 gap-3">
        {steps.map((step, i) => (
          <div key={i} className="flex gap-2.5 items-start">
            <span
              className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold shrink-0 mt-0.5"
              style={{ backgroundColor: STEP_COLORS[i] }}
            >
              {i + 1}
            </span>
            <div>
              <p className="text-sm font-semibold leading-tight">{step.title}</p>
              <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{step.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
