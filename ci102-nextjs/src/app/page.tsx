"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import dynamic from "next/dynamic";
import { useSearchParams, useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/error-boundary";
import { PREFECTURES } from "@/lib/codes";
import { usePrefectureData } from "@/lib/use-prefecture-data";
import { useMunicipalityData, type MunicipalityData } from "@/lib/use-municipality-data";

function TabSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <Skeleton className="h-[300px]" />
    </div>
  );
}

const LqTab = dynamic(() => import("@/components/tabs/lq-tab"), {
  loading: () => <TabSkeleton />,
});
const EbmTab = dynamic(() => import("@/components/tabs/ebm-tab"), {
  loading: () => <TabSkeleton />,
});
const ShiftShareTab = dynamic(() => import("@/components/tabs/shift-share-tab"), {
  loading: () => <TabSkeleton />,
});
const GapTab = dynamic(() => import("@/components/tabs/gap-tab"), {
  loading: () => <TabSkeleton />,
});
const RealEstateTab = dynamic(() => import("@/components/tabs/realestate-tab"), {
  loading: () => <TabSkeleton />,
});
const MapTab = dynamic(() => import("@/components/tabs/map-tab"), {
  loading: () => <TabSkeleton />,
});
const CrossTab = dynamic(() => import("@/components/tabs/cross-tab"), {
  loading: () => <TabSkeleton />,
});

const COLORS = {
  primary: "#1B2A4A",
  accent: "#D4A843",
  positive: "#2A9D8F",
  negative: "#E76F51",
  neutral: "#6B7280",
  bg: "#F8F9FA",
};

function KpiCard({ title, value, subtitle, trend, tooltip }: {
  title: string; value: string; subtitle?: string;
  trend?: "up" | "down" | "flat";
  tooltip?: string;
}) {
  const arrow = trend === "up" ? "↑" : trend === "down" ? "↓" : trend === "flat" ? "→" : "";
  const color = trend === "up" ? COLORS.positive : trend === "down" ? COLORS.negative : COLORS.neutral;
  const card = (
    <Card className="text-center">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-[#1B2A4A] dark:text-white">{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{arrow && <span style={{ color }} className="mr-1">{arrow}</span>}{subtitle}</p>}
      </CardContent>
    </Card>
  );
  if (!tooltip) return card;
  return (
    <Tooltip>
      <TooltipTrigger render={<div />}>
        {card}
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function KpiSkeletonGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
      {Array.from({ length: 7 }).map((_, i) => (
        <Card key={i} className="text-center">
          <CardHeader className="pb-2">
            <Skeleton className="h-4 w-20 mx-auto" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-16 mx-auto" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

const VALID_TABS = ["scorecard", "lq", "ebm", "shift", "gap", "realestate", "map", "cross"] as const;
type TabValue = (typeof VALID_TABS)[number];

function isValidTab(v: string | null): v is TabValue {
  return v !== null && (VALID_TABS as readonly string[]).includes(v);
}

function isValidPrefCode(v: number): boolean {
  return v >= 1 && v <= 47;
}

export default function Dashboard() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#F8F9FA] dark:bg-gray-950 flex items-center justify-center">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [prefCode, setPrefCode] = useState<number>(() => {
    const p = Number(searchParams.get("pref"));
    return isValidPrefCode(p) ? p : 13;
  });
  const [cityCode, setCityCode] = useState<string>(() => searchParams.get("city") ?? "");
  const [activeTab, setActiveTab] = useState<TabValue>(() => {
    const t = searchParams.get("tab");
    return isValidTab(t) ? t : "scorecard";
  });

  // Sync state -> URL (replaceState, no history entry)
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("pref", String(prefCode));
    if (cityCode) params.set("city", cityCode);
    if (activeTab !== "scorecard") params.set("tab", activeTab);
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [prefCode, cityCode, activeTab, router]);
  const { data: pref, allData, loading, error: prefError } = usePrefectureData(prefCode);
  const { data: municipalities, error: muniError } = useMunicipalityData(prefCode);
  const selectedCity = cityCode ? municipalities.find((m) => m.area_code === cityCode) ?? null : null;

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
      medianUnitPrice: p.median_unit_price ?? undefined,
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
    <div className="min-h-screen bg-[#F8F9FA] dark:bg-gray-950">
      {/* Skip navigation */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-4 focus:text-blue-600">
        メインコンテンツへスキップ
      </a>

      {/* Header */}
      <header className="text-white px-4 py-3 shadow-md md:px-6 md:py-4 bg-[#1B2A4A] dark:bg-gray-900">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <h1 className="text-lg font-bold tracking-tight md:text-xl">CI102 不動産市場分析ダッシュボード</h1>
            <div className="flex flex-wrap items-center gap-2 md:gap-3">
              <select value={prefCode} onChange={(e) => { setPrefCode(Number(e.target.value)); setCityCode(""); setAiResult(null); }}
                aria-label="都道府県を選択"
                className="rounded px-3 py-1.5 text-sm text-gray-900 bg-white dark:bg-gray-800 dark:text-gray-100 max-w-full md:max-w-[180px] focus:ring-2 focus:ring-blue-500 focus:outline-none">
                {Object.entries(PREFECTURES).map(([code, name]) => (
                  <option key={code} value={code}>{String(code).padStart(2, "0")} {name}</option>
                ))}
              </select>
              <select value={cityCode} onChange={(e) => setCityCode(e.target.value)}
                aria-label="市区町村を選択"
                className="rounded px-3 py-1.5 text-sm text-gray-900 bg-white dark:bg-gray-800 dark:text-gray-100 max-w-full md:max-w-[180px] focus:ring-2 focus:ring-blue-500 focus:outline-none">
                <option value="">全県</option>
                {municipalities.map((m) => (
                  <option key={m.area_code} value={m.area_code}>{m.area_name}</option>
                ))}
              </select>
              <Badge variant="outline" className="text-white border-white/30">
                {loading ? "読込中..." : selectedCity ? selectedCity.area_name : pref?.pref_name ?? "—"}
              </Badge>
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main id="main-content" className="max-w-7xl mx-auto px-4 py-4 md:px-6 md:py-6">
        {(prefError || muniError) && (
          <div className="mb-4 rounded-lg border border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950 p-3 text-sm text-red-800 dark:text-red-300">
            {prefError && <p>都道府県データ読込エラー: {prefError}</p>}
            {muniError && <p>市区町村データ読込エラー: {muniError}</p>}
          </div>
        )}
        {loading ? (
          <div className="space-y-6 py-6">
            <div className="text-center">
              <Skeleton className="h-10 w-80 mx-auto" />
              <Skeleton className="h-4 w-24 mx-auto mt-2" />
            </div>
            <KpiSkeletonGrid />
          </div>
        ) : !pref ? (
          <div className="text-center py-20 text-muted-foreground">データが見つかりません</div>
        ) : (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)} className="w-full">
            <TabsList className="w-full justify-start overflow-x-auto flex-nowrap" aria-label="分析タブ">
              <TabsTrigger value="scorecard" className="text-xs md:text-sm">
                <span className="md:hidden">⓪</span>
                <span className="hidden md:inline">⓪ スコアカード</span>
              </TabsTrigger>
              <TabsTrigger value="lq" className="text-xs md:text-sm">
                <span className="md:hidden">①</span>
                <span className="hidden md:inline">① 経済基盤</span>
              </TabsTrigger>
              <TabsTrigger value="ebm" className="text-xs md:text-sm">
                <span className="md:hidden">②</span>
                <span className="hidden md:inline">② 需要予測</span>
              </TabsTrigger>
              <TabsTrigger value="shift" className="text-xs md:text-sm">
                <span className="md:hidden">③</span>
                <span className="hidden md:inline">③ シフトシェア</span>
              </TabsTrigger>
              <TabsTrigger value="gap" className="text-xs md:text-sm">
                <span className="md:hidden">④</span>
                <span className="hidden md:inline">④ 小売市場</span>
              </TabsTrigger>
              <TabsTrigger value="realestate" className="text-xs md:text-sm">
                <span className="md:hidden">⑤</span>
                <span className="hidden md:inline">⑤ 不動産取引</span>
              </TabsTrigger>
              <TabsTrigger value="map" className="text-xs md:text-sm">
                <span className="md:hidden">⑥</span>
                <span className="hidden md:inline">⑥ 地図分析</span>
              </TabsTrigger>
              <TabsTrigger value="cross" className="text-xs md:text-sm">
                <span className="md:hidden">⑦</span>
                <span className="hidden md:inline">⑦ クロス分析</span>
              </TabsTrigger>
            </TabsList>

            <div className="mt-6">
              {/* Tab 0: Scorecard */}
              <TabsContent value="scorecard">
                <ErrorBoundary>
                <div className="space-y-6">
                  <div className="text-center">
                    <h2 className="text-4xl font-bold" style={{ color: scoreColor }}>
                      投資適格スコア: {pref.suitability_score.total_score.toFixed(0)} / 100
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">{pref.pref_name}</p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
                    <KpiCard title="EBM" value={pref.ebm.toFixed(2)} subtitle="経済基盤乗数" tooltip="基盤雇用1人が支える総雇用数。値が大きいほど波及効果が大きい" />
                    <KpiCard title="PER" value={pref.per.toFixed(2)} subtitle="人口雇用比率" tooltip="就業者1人あたりの総人口。住戸需要の推計に使用" />
                    <KpiCard title="基盤雇用比率" value={`${pref.basic_ratio.toFixed(1)}%`} tooltip="LQ>1.0の産業の超過雇用が総雇用に占める割合" />
                    <KpiCard title="RS合計" value={pref.rs_total.toLocaleString()} trend={pref.rs_total > 0 ? "up" : pref.rs_total < 0 ? "down" : "flat"} tooltip="地域シフト合計。正=全国を上回る競争力、負=劣位" />
                    <KpiCard title="漏損/余剰" value={pref.aggregate_gap_factor.toFixed(1)} tooltip="小売購買力の流出入度合い。正=漏損(出店機会)、負=余剰(供給過多)" />
                    <KpiCard title="昼間人口" value={pref.daytime_population.toLocaleString()} tooltip="通勤・通学で流入する人口を含む日中の人口" />
                    <KpiCard title="実績雇用変化" value={pref.actual_emp_change.toLocaleString()} subtitle="2016→2021" trend={pref.actual_emp_change > 0 ? "up" : "down"} tooltip="2016年→2021年の実際の雇用増減（経済センサス）" />
                  </div>

                  {selectedCity && (
                    <>
                      <Separator />
                      <div className="rounded-lg border p-4 bg-sky-50 dark:bg-sky-950/30">
                        <h3 className="font-semibold mb-3">{selectedCity.area_name} — 市区町村データ</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <KpiCard title="総雇用" value={selectedCity.total_emp.toLocaleString()} />
                          <KpiCard title="基盤雇用" value={Math.round(selectedCity.basic_emp).toLocaleString()} />
                          <KpiCard title="基盤雇用比率" value={`${selectedCity.basic_ratio.toFixed(1)}%`} />
                          <KpiCard title="最大LQ産業" value={`${selectedCity.max_lq.toFixed(2)}`} subtitle={selectedCity.max_lq_industry} />
                        </div>
                      </div>
                    </>
                  )}

                  <Separator />

                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <h3 className="text-lg font-semibold mb-3">基盤産業 TOP 5</h3>
                      <div className="space-y-2">
                        {pref.top_lq_industries.map((r) => (
                          <div key={r.industry} className="flex justify-between items-center rounded-lg border p-3">
                            <span className="text-sm font-medium">{r.industry}</span>
                            <div className="text-right">
                              <span className="text-lg font-bold text-[#2A9D8F]">LQ {r.lq.toFixed(2)}</span>
                              <p className="text-xs text-muted-foreground">基盤雇用 {Math.round(r.basic_emp_estimate).toLocaleString()}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold mb-3">投資シグナル</h3>
                      <div className="space-y-2">
                        {pref.rs_total > 0 && <div className="rounded-lg border-l-4 border-l-[#2A9D8F] p-3 bg-green-50 dark:bg-green-950/30"><p className="text-sm">RS合計 +{pref.rs_total.toLocaleString()} — 全国を上回る競争優位</p></div>}
                        {pref.rs_total < 0 && <div className="rounded-lg border-l-4 border-l-[#E76F51] p-3 bg-red-50 dark:bg-red-950/30"><p className="text-sm">RS合計 {pref.rs_total.toLocaleString()} — 競争力低下に注意</p></div>}
                        {pref.aggregate_gap_factor > 10 && <div className="rounded-lg border-l-4 border-l-[#2A9D8F] p-3 bg-green-50 dark:bg-green-950/30"><p className="text-sm">小売漏損 +{pref.aggregate_gap_factor.toFixed(1)} — {pref.num_leakage_sectors}セクターに出店機会</p></div>}
                        {pref.aggregate_gap_factor < -10 && <div className="rounded-lg border-l-4 border-l-[#E76F51] p-3 bg-red-50 dark:bg-red-950/30"><p className="text-sm">供給過多 {pref.aggregate_gap_factor.toFixed(1)} — {pref.num_surplus_sectors}セクターが競争過多</p></div>}
                        {pref.actual_emp_change < 0 && <div className="rounded-lg border-l-4 border-l-[#E76F51] p-3 bg-red-50 dark:bg-red-950/30"><p className="text-sm">雇用減少トレンド: 2016→2021で{pref.actual_emp_change.toLocaleString()}人</p></div>}
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Proformer */}
                  <div className="rounded-lg border p-4">
                    <h3 className="font-semibold mb-2">Proformer 物件データ連携</h3>
                    <div className="flex gap-2 items-end">
                      <input value={pfId} onChange={(e) => setPfId(e.target.value)} placeholder="物件データID (external_id)"
                        aria-label="Proformer 物件データID"
                        className="flex-1 rounded border px-3 py-1.5 text-sm bg-background text-foreground focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                      <button onClick={fetchProformer} disabled={pfLoading || !pfId}
                        aria-label="Proformer データを取得"
                        className="rounded bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-4 py-1.5 text-sm disabled:opacity-50 focus:ring-2 focus:ring-blue-500 focus:outline-none">
                        {pfLoading ? "取得中..." : "取得"}
                      </button>
                    </div>
                    {pfData && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
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
                      aria-label="AI分析を生成"
                      className="rounded bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-4 py-1.5 text-sm disabled:opacity-50 focus:ring-2 focus:ring-blue-500 focus:outline-none">
                      {aiLoading ? "分析中..." : pfData ? "AI統合分析を生成（地域+物件）" : "AI分析を生成"}
                    </button>
                    {aiResult && (
                      <div className="mt-3 prose prose-sm dark:prose-invert max-w-none">
                        <div dangerouslySetInnerHTML={{ __html: aiResult.replace(/\n/g, "<br/>") }} />
                        <p className="text-xs text-muted-foreground mt-2">
                          この分析はAIが生成したものです。過去のスナップショットデータに基づいています。
                        </p>
                      </div>
                    )}
                  </div>

                  <details open className="rounded-lg border p-4 text-sm text-muted-foreground">
                    <summary className="font-medium cursor-pointer">ℹ️ データの時点と制限</summary>
                    <ul className="mt-2 space-y-1 list-disc list-inside">
                      <li>経済センサス: 2021年6月時点（5年ごと更新、次回2026年）</li>
                      <li>国勢調査: 2020年10月時点（人口は2015年の値を2020年境界に組替）</li>
                      <li>MLIT取引価格: 選択した四半期の実績（リアルタイムではない）</li>
                      <li>これらは過去のスナップショットであり、現在の市場状況と異なる可能性があります</li>
                    </ul>
                  </details>
                </div>
                </ErrorBoundary>
              </TabsContent>

              {/* Tab 1: LQ */}
              <TabsContent value="lq">
                <ErrorBoundary>
                <LqTab
                  localEmp={Object.fromEntries(pref.lq_table.map((r) => [r.industry, r.local_emp]))}
                  nationalEmp={Object.fromEntries(pref.lq_table.map((r) => [r.industry, r.national_emp]))}
                  localT0={pref.shift_share_table.length > 0 ? Object.fromEntries(pref.shift_share_table.map((r) => [r.industry, 0])) : undefined}
                  localT1={pref.shift_share_table.length > 0 ? Object.fromEntries(pref.shift_share_table.map((r) => [r.industry, r.actual_change])) : undefined}
                  nationalT0={undefined}
                  nationalT1={undefined}
                  selectedCity={selectedCity}
                />
                </ErrorBoundary>
              </TabsContent>

              {/* Tab 2: EBM */}
              <TabsContent value="ebm">
                <ErrorBoundary>
                <EbmTab
                  localEmp={Object.fromEntries(pref.lq_table.map((r) => [r.industry, r.local_emp]))}
                  nationalEmp={Object.fromEntries(pref.lq_table.map((r) => [r.industry, r.national_emp]))}
                  population={pref.population}
                  totalEmployment={pref.total_employment}
                  personsPerHousehold={pref.persons_per_household}
                  selectedCity={selectedCity}
                />
                </ErrorBoundary>
              </TabsContent>

              {/* Tab 3: Shift-Share */}
              <TabsContent value="shift">
                <ErrorBoundary>
                {pref.shift_share_table.length > 0 ? (
                  <ShiftShareTab precomputed={pref.shift_share_table} selectedCity={selectedCity} />
                ) : (
                  <div className="text-center py-12 text-muted-foreground">シフトシェアデータがありません</div>
                )}
                </ErrorBoundary>
              </TabsContent>

              {/* Tab 4: Gap */}
              <TabsContent value="gap">
                <ErrorBoundary>
                <GapTab sectors={pref.gap_table.map((r) => ({ sector: r.sector, demand: r.demand, supply: r.supply }))} selectedCity={selectedCity} />
                </ErrorBoundary>
              </TabsContent>

              {/* Tab 5: Real Estate */}
              <TabsContent value="realestate">
                <ErrorBoundary>
                <RealEstateTab prefCode={prefCode} cityCode={cityCode ? Number(cityCode) : undefined} />
                </ErrorBoundary>
              </TabsContent>

              {/* Tab 6: Map */}
              <TabsContent value="map">
                <ErrorBoundary>
                <MapTab prefCode={prefCode} prefName={pref.pref_name} allData={allData} />
                </ErrorBoundary>
              </TabsContent>

              {/* Tab 7: Cross */}
              <TabsContent value="cross">
                <ErrorBoundary>
                <CrossTab areas={crossAreas} highlightPrefCode={prefCode} />
                </ErrorBoundary>
              </TabsContent>
            </div>
          </Tabs>
        )}
      </main>

      <footer className="border-t mt-auto px-4 py-3 md:px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground text-center sm:text-left">
            分析手法: 経済基盤分析（LQ/EBM/PER）、シフトシェア分析、ギャップ分析 |
            データ: e-Stat 経済センサス活動調査 2021 / 国勢調査 2020 / 国土交通省不動産情報ライブラリ
          </p>
          <a href="/learn" className="text-xs text-[#D4A843] hover:underline whitespace-nowrap">
            分析手法を学ぶ &rarr;
          </a>
        </div>
      </footer>
    </div>
  );
}
