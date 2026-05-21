"use client";

import { useState, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PREFECTURES } from "@/lib/codes";
import { usePrefectureData } from "@/lib/use-prefecture-data";
import LqTab from "@/components/tabs/lq-tab";
import EbmTab from "@/components/tabs/ebm-tab";
import ShiftShareTab from "@/components/tabs/shift-share-tab";
import GapTab from "@/components/tabs/gap-tab";
import RealEstateTab from "@/components/tabs/realestate-tab";
import MapTab from "@/components/tabs/map-tab";
import CrossTab from "@/components/tabs/cross-tab";

const COLORS = {
  primary: "#1B2A4A",
  accent: "#D4A843",
  positive: "#2A9D8F",
  negative: "#E76F51",
  neutral: "#6B7280",
  bg: "#F8F9FA",
};

function KpiCard({ title, value, subtitle, trend }: {
  title: string; value: string; subtitle?: string;
  trend?: "up" | "down" | "flat";
}) {
  const arrow = trend === "up" ? "↑" : trend === "down" ? "↓" : trend === "flat" ? "→" : "";
  const color = trend === "up" ? COLORS.positive : trend === "down" ? COLORS.negative : COLORS.neutral;
  return (
    <Card className="text-center">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold" style={{ color: COLORS.primary }}>{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{arrow && <span style={{ color }} className="mr-1">{arrow}</span>}{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const [prefCode, setPrefCode] = useState(13);
  const { data: pref, allData, loading } = usePrefectureData(prefCode);

  // Proformer state
  const [pfId, setPfId] = useState("");
  const [pfData, setPfData] = useState<any>(null);
  const [pfLoading, setPfLoading] = useState(false);

  // AI analysis state
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const scoreColor = pref
    ? pref.suitability_score.total_score >= 60 ? COLORS.positive
      : pref.suitability_score.total_score >= 40 ? COLORS.accent
      : COLORS.negative
    : COLORS.neutral;

  // Cross-analysis data (all prefectures)
  const crossAreas = useMemo(() => {
    if (!allData) return [];
    return Object.values(allData).map((p) => ({
      name: p.pref_name,
      prefCode: p.pref_code,
      localEmp: Object.fromEntries(p.lq_table.map((r) => [r.industry, r.local_emp])),
      nationalEmp: Object.fromEntries(p.lq_table.map((r) => [r.industry, r.national_emp])),
      retailSectors: p.gap_table.map((r) => ({ sector: r.sector, demand: r.demand, supply: r.supply })),
      medianUnitPrice: undefined, // MLIT data not pre-computed
    }));
  }, [allData]);

  // Proformer fetch
  const fetchProformer = async () => {
    if (!pfId) return;
    setPfLoading(true);
    try {
      const res = await fetch(`/api/proformer?externalId=${pfId}`);
      const json = await res.json();
      if (json.error) { setPfData(null); } else { setPfData(json); }
    } catch { setPfData(null); }
    setPfLoading(false);
  };

  // AI analysis
  const runAiAnalysis = async () => {
    if (!pref) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefData: pref, proformerData: pfData }),
      });
      const json = await res.json();
      setAiResult(json.analysis ?? json.error ?? "分析生成に失敗しました");
    } catch { setAiResult("API接続エラー"); }
    setAiLoading(false);
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.bg }}>
      {/* Header */}
      <header className="text-white px-6 py-4 shadow-md" style={{ backgroundColor: COLORS.primary }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">CI102 不動産市場分析ダッシュボード</h1>
          <div className="flex items-center gap-3">
            <select value={prefCode} onChange={(e) => { setPrefCode(Number(e.target.value)); setAiResult(null); }}
              className="rounded px-3 py-1.5 text-sm text-gray-900 bg-white">
              {Object.entries(PREFECTURES).map(([code, name]) => (
                <option key={code} value={code}>{String(code).padStart(2, "0")} {name}</option>
              ))}
            </select>
            <Badge variant="outline" className="text-white border-white/30">
              {loading ? "読込中..." : pref?.pref_name ?? "—"}
            </Badge>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        {loading ? (
          <div className="text-center py-20 text-muted-foreground animate-pulse">全国データを読込中...</div>
        ) : !pref ? (
          <div className="text-center py-20 text-muted-foreground">データが見つかりません</div>
        ) : (
          <Tabs defaultValue="scorecard" className="w-full">
            <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
              <TabsTrigger value="scorecard">⓪ スコアカード</TabsTrigger>
              <TabsTrigger value="lq">① 経済基盤</TabsTrigger>
              <TabsTrigger value="ebm">② 需要予測</TabsTrigger>
              <TabsTrigger value="shift">③ シフトシェア</TabsTrigger>
              <TabsTrigger value="gap">④ 小売市場</TabsTrigger>
              <TabsTrigger value="realestate">⑤ 不動産取引</TabsTrigger>
              <TabsTrigger value="map">⑥ 地図分析</TabsTrigger>
              <TabsTrigger value="cross">⑦ クロス分析</TabsTrigger>
            </TabsList>

            <div className="mt-6">
              {/* Tab 0: Scorecard */}
              <TabsContent value="scorecard">
                <div className="space-y-6">
                  <div className="text-center">
                    <h2 className="text-4xl font-bold" style={{ color: scoreColor }}>
                      投資適格スコア: {pref.suitability_score.total_score.toFixed(0)} / 100
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">{pref.pref_name}</p>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                    <KpiCard title="EBM" value={pref.ebm.toFixed(2)} subtitle="経済基盤乗数" />
                    <KpiCard title="PER" value={pref.per.toFixed(2)} subtitle="人口雇用比率" />
                    <KpiCard title="基盤雇用比率" value={`${pref.basic_ratio.toFixed(1)}%`} />
                    <KpiCard title="RS合計" value={pref.rs_total.toLocaleString()} trend={pref.rs_total > 0 ? "up" : pref.rs_total < 0 ? "down" : "flat"} />
                    <KpiCard title="漏損/余剰" value={pref.aggregate_gap_factor.toFixed(1)} />
                    <KpiCard title="昼間人口" value={pref.daytime_population.toLocaleString()} />
                    <KpiCard title="実績雇用変化" value={pref.actual_emp_change.toLocaleString()} subtitle="2016→2021" trend={pref.actual_emp_change > 0 ? "up" : "down"} />
                  </div>

                  <Separator />

                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <h3 className="text-lg font-semibold mb-3">基盤産業 TOP 5</h3>
                      <div className="space-y-2">
                        {pref.top_lq_industries.map((r) => (
                          <div key={r.industry} className="flex justify-between items-center rounded-lg border p-3">
                            <span className="text-sm font-medium">{r.industry}</span>
                            <div className="text-right">
                              <span className="text-lg font-bold" style={{ color: COLORS.positive }}>LQ {r.lq.toFixed(2)}</span>
                              <p className="text-xs text-muted-foreground">基盤雇用 {Math.round(r.basic_emp_estimate).toLocaleString()}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold mb-3">投資シグナル</h3>
                      <div className="space-y-2">
                        {pref.rs_total > 0 && <div className="rounded-lg border-l-4 p-3" style={{ borderLeftColor: COLORS.positive, backgroundColor: "#f0fdf4" }}><p className="text-sm">RS合計 +{pref.rs_total.toLocaleString()} — 全国を上回る競争優位</p></div>}
                        {pref.rs_total < 0 && <div className="rounded-lg border-l-4 p-3" style={{ borderLeftColor: COLORS.negative, backgroundColor: "#fef2f2" }}><p className="text-sm">RS合計 {pref.rs_total.toLocaleString()} — 競争力低下に注意</p></div>}
                        {pref.aggregate_gap_factor > 10 && <div className="rounded-lg border-l-4 p-3" style={{ borderLeftColor: COLORS.positive, backgroundColor: "#f0fdf4" }}><p className="text-sm">小売漏損 +{pref.aggregate_gap_factor.toFixed(1)} — {pref.num_leakage_sectors}セクターに出店機会</p></div>}
                        {pref.aggregate_gap_factor < -10 && <div className="rounded-lg border-l-4 p-3" style={{ borderLeftColor: COLORS.negative, backgroundColor: "#fef2f2" }}><p className="text-sm">供給過多 {pref.aggregate_gap_factor.toFixed(1)} — {pref.num_surplus_sectors}セクターが競争過多</p></div>}
                        {pref.actual_emp_change < 0 && <div className="rounded-lg border-l-4 p-3" style={{ borderLeftColor: COLORS.negative, backgroundColor: "#fef2f2" }}><p className="text-sm">雇用減少トレンド: 2016→2021で{pref.actual_emp_change.toLocaleString()}人</p></div>}
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Proformer */}
                  <div className="rounded-lg border p-4">
                    <h3 className="font-semibold mb-2">Proformer 物件データ連携</h3>
                    <div className="flex gap-2 items-end">
                      <input value={pfId} onChange={(e) => setPfId(e.target.value)} placeholder="物件データID (external_id)"
                        className="flex-1 rounded border px-3 py-1.5 text-sm" />
                      <button onClick={fetchProformer} disabled={pfLoading || !pfId}
                        className="rounded bg-slate-900 text-white px-4 py-1.5 text-sm disabled:opacity-50">
                        {pfLoading ? "取得中..." : "取得"}
                      </button>
                    </div>
                    {pfData && (
                      <div className="grid grid-cols-4 gap-3 mt-3">
                        <KpiCard title="取得価格" value={`¥${(pfData.property?.acquisition_price ?? 0).toLocaleString()}`} />
                        <KpiCard title="NOI" value={`¥${(pfData.noi_annual ?? 0).toLocaleString()}`} />
                        <KpiCard title="Cap Rate" value={`${((pfData.investment_performance?.cap_rate ?? 0) * 100).toFixed(1)}%`} />
                        <KpiCard title="IRR" value={`${((pfData.investment_performance?.irr ?? 0) * 100).toFixed(1)}%`} />
                      </div>
                    )}
                  </div>

                  {/* AI Analysis */}
                  <div className="rounded-lg border p-4">
                    <h3 className="font-semibold mb-2">AI分析（Claude）</h3>
                    <button onClick={runAiAnalysis} disabled={aiLoading}
                      className="rounded bg-slate-900 text-white px-4 py-1.5 text-sm disabled:opacity-50">
                      {aiLoading ? "分析中..." : pfData ? "AI統合分析を生成（地域+物件）" : "AI分析を生成"}
                    </button>
                    {aiResult && (
                      <div className="mt-3 prose prose-sm max-w-none">
                        <div dangerouslySetInnerHTML={{ __html: aiResult.replace(/\n/g, "<br/>") }} />
                        <p className="text-xs text-muted-foreground mt-2">
                          この分析はAIが生成したものです。過去のスナップショットデータに基づいています。
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg bg-slate-50 p-4 text-xs text-muted-foreground">
                    <p className="font-medium mb-1">データの時点と制限</p>
                    <p>経済センサス: 2021年6月 / 国勢調査: 2020年10月（人口は2015年組替値） / すべて過去のスナップショット</p>
                  </div>
                </div>
              </TabsContent>

              {/* Tab 1: LQ */}
              <TabsContent value="lq">
                <LqTab
                  localEmp={Object.fromEntries(pref.lq_table.map((r) => [r.industry, r.local_emp]))}
                  nationalEmp={Object.fromEntries(pref.lq_table.map((r) => [r.industry, r.national_emp]))}
                  localT0={pref.shift_share_table.length > 0 ? Object.fromEntries(pref.shift_share_table.map((r) => [r.industry, 0])) : undefined}
                  localT1={pref.shift_share_table.length > 0 ? Object.fromEntries(pref.shift_share_table.map((r) => [r.industry, r.actual_change])) : undefined}
                  nationalT0={undefined}
                  nationalT1={undefined}
                />
              </TabsContent>

              {/* Tab 2: EBM */}
              <TabsContent value="ebm">
                <EbmTab
                  localEmp={Object.fromEntries(pref.lq_table.map((r) => [r.industry, r.local_emp]))}
                  nationalEmp={Object.fromEntries(pref.lq_table.map((r) => [r.industry, r.national_emp]))}
                  population={pref.population}
                  totalEmployment={pref.total_employment}
                  personsPerHousehold={pref.persons_per_household}
                />
              </TabsContent>

              {/* Tab 3: Shift-Share */}
              <TabsContent value="shift">
                {pref.shift_share_table.length > 0 ? (
                  <ShiftShareTab
                    localT0={{}} localT1={{}} nationalT0={{}} nationalT1={{}}
                  />
                ) : (
                  <div className="text-center py-12 text-muted-foreground">シフトシェアデータがありません</div>
                )}
              </TabsContent>

              {/* Tab 4: Gap */}
              <TabsContent value="gap">
                <GapTab sectors={pref.gap_table.map((r) => ({ sector: r.sector, demand: r.demand, supply: r.supply }))} />
              </TabsContent>

              {/* Tab 5: Real Estate */}
              <TabsContent value="realestate">
                <RealEstateTab prefCode={prefCode} />
              </TabsContent>

              {/* Tab 6: Map */}
              <TabsContent value="map">
                <MapTab prefCode={prefCode} prefName={pref.pref_name} />
              </TabsContent>

              {/* Tab 7: Cross */}
              <TabsContent value="cross">
                <CrossTab areas={crossAreas} highlightPrefCode={prefCode} />
              </TabsContent>
            </div>
          </Tabs>
        )}
      </main>

      <footer className="border-t mt-auto px-6 py-3">
        <p className="text-xs text-muted-foreground text-center max-w-7xl mx-auto">
          分析手法: 経済基盤分析（LQ/EBM/PER）、シフトシェア分析、ギャップ分析 |
          データ: e-Stat 経済センサス活動調査 2021 / 国勢調査 2020 / 国土交通省不動産情報ライブラリ
        </p>
      </footer>
    </div>
  );
}
