"use client";

import { useMemo, useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  lq_table, total_basic_employment, economic_base_multiplier,
  population_employment_ratio, forecast_total_employment_change,
  forecast_population_change, forecast_housing_units,
  forecast_required_floor_area, forecast_building_count,
  development_feasibility,
} from "@/lib/calculator";
import type { MunicipalityData } from "@/lib/use-municipality-data";
import { ReadingGuide } from "@/components/ui/reading-guide";

interface HousingDefaults {
  avg_unit_area_m2: number;
  avg_floors: number;
  avg_floors_all_residential: number | null;
  avg_units_per_building: number;
  avg_units_per_floor: number;
  apartment_units_2023: number | null;
  apartment_buildings_3f_plus_2023: number | null;
  story_distribution: Record<string, number> | null;
  data_year: number;
}

let _housingCache: Record<string, HousingDefaults> | null = null;

interface Props {
  localEmp: Record<string, number>;
  nationalEmp: Record<string, number>;
  population: number;
  totalEmployment: number;
  personsPerHousehold: number;
  prefCode: number;
  selectedCity?: MunicipalityData | null;
}

export default function EbmTab({ localEmp, nationalEmp, population, totalEmployment, personsPerHousehold, prefCode, selectedCity }: Props) {
  const [newBasicJobs, setNewBasicJobs] = useState(100);
  const [avgUnitSize, setAvgUnitSize] = useState(65);
  const [floorsPerBldg, setFloorsPerBldg] = useState(5);
  const [housingDefaults, setHousingDefaults] = useState<HousingDefaults | null>(null);

  // Load housing defaults and set initial values based on prefecture
  useEffect(() => {
    const load = async () => {
      if (!_housingCache) {
        try {
          const res = await fetch("/data/housing_defaults.json");
          _housingCache = await res.json();
        } catch {
          return;
        }
      }
      const defaults = _housingCache?.[String(prefCode)];
      if (defaults) {
        setHousingDefaults(defaults);
        setAvgUnitSize(Math.round(defaults.avg_unit_area_m2));
        // avg_floors is now 3F+ apartment buildings only (from 建築着工統計)
        setFloorsPerBldg(Math.round(defaults.avg_floors));
        // units per floor from data
        const upf = Math.max(2, Math.round(defaults.avg_units_per_floor));
        setUnitsPerFloor(upf);
      }
    };
    load();
  }, [prefCode]);
  const [unitsPerFloor, setUnitsPerFloor] = useState(4);
  const [landPrice, setLandPrice] = useState(100000);
  const [constructionCost, setConstructionCost] = useState(250000);
  const [targetYield, setTargetYield] = useState(5);

  const lq = useMemo(() => lq_table(localEmp, nationalEmp), [localEmp, nationalEmp]);
  const basic = useMemo(() => total_basic_employment(lq), [lq]);
  const totalEmp = lq.reduce((s, r) => s + r.local_emp, 0);
  const ebm = economic_base_multiplier(totalEmp, basic);
  const per = population_employment_ratio(population, totalEmployment);

  const deltaTotal = forecast_total_employment_change(newBasicJobs, ebm);
  const deltaPop = forecast_population_change(deltaTotal, per);
  const deltaHousing = forecast_housing_units(deltaPop, personsPerHousehold);
  const floorArea = forecast_required_floor_area(deltaHousing, avgUnitSize);
  const bldgCount = forecast_building_count(deltaHousing, floorsPerBldg, unitsPerFloor);

  const feas = development_feasibility(deltaHousing, avgUnitSize, landPrice, constructionCost, targetYield / 100);

  return (
    <div className="space-y-6">
      {/* 粒度ガイド */}
      <div className="rounded-lg border-l-4 border-blue-400 bg-blue-50 dark:bg-blue-950/20 p-3 text-xs">
        <strong>📐 業種粒度: 大分類17業種</strong>。需要予測カスケード(基盤雇用→総雇用→人口→住宅)も大分類版で算出。
        中分類版での比較は <strong>スコアカード(⓪)の粒度トグル</strong>のKPIで確認可能。
        <strong>⚠️ EBM は『高いほど経済が強い』ではなく『多角化度の逆数』</strong>。EBM 3-6 が教科書 MSA 健全レンジ。
        詳細解説は <a href="/learn#ch9-granularity" className="underline text-blue-700">学習第9章</a>。
      </div>

      {/* EBM/PER KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">EBM</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{ebm.toFixed(2)}</div><p className="text-xs text-muted-foreground">基盤雇用1人が支える総雇用</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">PER</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{per.toFixed(2)}</div><p className="text-xs text-muted-foreground">就業者1人あたり総人口</p></CardContent>
        </Card>
      </div>

      {/* Municipality highlight */}
      {selectedCity && (
        <div className="rounded-lg border p-4" style={{ backgroundColor: "#f0f9ff" }}>
          <h3 className="font-semibold mb-3">{selectedCity.area_name} — 市区町村データ</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">総雇用</CardTitle></CardHeader>
              <CardContent><div className="text-xl font-bold">{selectedCity.total_emp.toLocaleString()}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">基盤雇用</CardTitle></CardHeader>
              <CardContent><div className="text-xl font-bold">{Math.round(selectedCity.basic_emp).toLocaleString()}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">基盤雇用比率</CardTitle></CardHeader>
              <CardContent><div className="text-xl font-bold">{selectedCity.basic_ratio.toFixed(1)}%</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">基盤産業数</CardTitle></CardHeader>
              <CardContent><div className="text-xl font-bold">{selectedCity.num_basic}</div></CardContent>
            </Card>
          </div>
          <p className="text-xs text-muted-foreground mt-2">EBM/PER・シミュレーションは都道府県レベルの値です。市区町村の基盤雇用を比較参照してください。</p>
        </div>
      )}

      {/* Reading Guide */}
      <ReadingGuide steps={[
        { title: "EBMの大きさを見る", description: "EBM=5なら基盤雇用1人増→総雇用5人増。大きいほど地域経済への波及が大きく、テナント需要を喚起しやすい。" },
        { title: "カスケードの流れを追う", description: "基盤雇用→(×EBM)→総雇用→(×PER)→人口→(÷世帯人員)→住宅需要。各段階の乗数が投資規模を決める。" },
        { title: "開発フィジビリティを確認", description: "必要年間賃料と市場賃料を比較。市場賃料が上回れば事業として成立する見通し。" },
      ]} />

      {/* Simulation Input */}
      <div className="rounded-lg border p-4 space-y-4">
        <div>
          <h3 className="font-semibold mb-1">シミュレーション（What-If）</h3>
          <p className="text-xs text-muted-foreground">基盤雇用が変動した場合の波及効果。予測ではありません。</p>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="new-basic-jobs" className="text-xs font-medium block mb-1">新規基盤雇用</label>
            <input id="new-basic-jobs" type="number" value={newBasicJobs} onChange={(e) => setNewBasicJobs(Number(e.target.value))}
              aria-label="新規基盤雇用の人数"
              className="rounded border px-3 py-1.5 w-24 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
          </div>
          <div>
            <label htmlFor="avg-unit-size" className="text-xs font-medium block mb-1">平均専有面積 (m2)</label>
            <input id="avg-unit-size" type="number" value={avgUnitSize} onChange={(e) => setAvgUnitSize(Number(e.target.value))}
              aria-label="平均専有面積"
              className="rounded border px-3 py-1.5 w-20 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
          </div>
          <div>
            <label htmlFor="floors-per-bldg" className="text-xs font-medium block mb-1">階数</label>
            <input id="floors-per-bldg" type="number" value={floorsPerBldg} onChange={(e) => setFloorsPerBldg(Number(e.target.value))}
              aria-label="階数"
              className="rounded border px-3 py-1.5 w-16 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
          </div>
          <div>
            <label htmlFor="units-per-floor" className="text-xs font-medium block mb-1">各階戸数</label>
            <input id="units-per-floor" type="number" value={unitsPerFloor} onChange={(e) => setUnitsPerFloor(Number(e.target.value))}
              aria-label="各階戸数"
              className="rounded border px-3 py-1.5 w-16 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
          </div>
        </div>
        {housingDefaults && (
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-3 text-xs space-y-2">
            <p className="font-semibold text-blue-700 dark:text-blue-400">
              初期値は建築着工統計（{housingDefaults.data_year}年）に基づく地域実績データです
            </p>
            <div className="text-blue-600 dark:text-blue-400 space-y-0.5">
              <p>
                平均専有面積: <strong>{housingDefaults.avg_unit_area_m2}m2/戸</strong>（共同住宅 新築着工の床面積合計 / 戸数）
              </p>
              <p>
                平均階数: <strong>{housingDefaults.avg_floors}F</strong>（3階以上の居住専用建物のみ。1-2階建て＝戸建住宅は除外）
              </p>
              <p>
                棟あたり平均戸数: <strong>{housingDefaults.avg_units_per_building}戸</strong>（共同住宅着工戸数 / 3F以上建物数）
              </p>
              {housingDefaults.apartment_units_2023 != null && housingDefaults.apartment_buildings_3f_plus_2023 != null && (
                <p>
                  着工実績: 年間 {housingDefaults.apartment_units_2023.toLocaleString()}戸 / {housingDefaults.apartment_buildings_3f_plus_2023.toLocaleString()}棟
                </p>
              )}
              {housingDefaults.story_distribution && (
                <p>
                  階数分布（3F以上）: {Object.entries(housingDefaults.story_distribution).map(([k, v]) => `${k}=${v}棟`).join("、")}
                </p>
              )}
            </div>
            <div className="text-muted-foreground space-y-1 border-t border-blue-200 dark:border-blue-800 pt-2 mt-1">
              <p>
                出典: e-Stat 建築着工統計 年報（国土交通省）Table 16（戸数・床面積）/ Table 4（階数別建物数）。
                実際の開発計画に合わせて数値を変更してください。
              </p>
              <p className="font-semibold text-amber-700 dark:text-amber-400">
                Lagging Indicator（遅行指標）に関する注意:
              </p>
              <p>
                建築着工統計は過去の着工実績を集計したものであり、現在の市場状況を直接反映するものではありません。
                統計公表時点（{housingDefaults.data_year}年実績）から現在まで、建設コスト・金利・用地価格・建築基準の変化により、
                実際の開発パラメータは変動している可能性があります。
              </p>
              <p>
                また、EBM/PERカスケード全体が経済センサス（2021年）・国勢調査（2020年）に基づくスナップショットです。
                これらはいずれも遅行指標であり、直近の産業構造変化（企業誘致・撤退、リモートワーク普及等）は反映されていません。
                投資判断には最新の市場調査と組み合わせてご利用ください。
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Cascade Step Flow */}
      <div aria-label="EBM/PER カスケードフロー">
        <h3 className="text-sm font-semibold mb-3">EBM/PER カスケード → 不動産開発規模</h3>

        {/* Step flow: each stage as a card connected by arrows with multipliers */}
        {(() => {
          const steps = [
            { label: "基盤雇用", value: `${newBasicJobs}人`, color: "#2A9D8F", multiplier: null },
            { label: "総雇用", value: `${Math.round(deltaTotal).toLocaleString()}人`, color: "#3B82F6", multiplier: `×${ebm.toFixed(1)}` },
            { label: "人口", value: `${Math.round(deltaPop).toLocaleString()}人`, color: "#8B5CF6", multiplier: `×${per.toFixed(1)}` },
            { label: "住戸需要", value: `${Math.round(deltaHousing).toLocaleString()}戸`, color: "#F59E0B", multiplier: `÷${personsPerHousehold.toFixed(1)}` },
            { label: "延床面積", value: `${Math.round(floorArea).toLocaleString()}m²`, color: "#1B2A4A", multiplier: `×${avgUnitSize}m²` },
            { label: "棟数", value: `${bldgCount.toFixed(1)}棟`, color: "#6B7280", multiplier: `÷${floorsPerBldg * unitsPerFloor}戸` },
          ];

          return (
            <div className="space-y-4">
              {/* Desktop: horizontal flow */}
              <div className="hidden md:flex items-center justify-center gap-0 overflow-x-auto py-2">
                {steps.map((step, i) => (
                  <div key={i} className="flex items-center shrink-0">
                    {/* Arrow with multiplier (before each step except first) */}
                    {i > 0 && (
                      <div className="flex flex-col items-center mx-1 w-16">
                        <span className="text-[11px] font-bold whitespace-nowrap" style={{ color: step.color }}>
                          {step.multiplier}
                        </span>
                        <div className="flex items-center w-full">
                          <div className="flex-1 h-0.5 bg-gray-300 dark:bg-gray-600" />
                          <span className="text-gray-400 text-lg -ml-1">›</span>
                        </div>
                      </div>
                    )}
                    {/* Step card */}
                    <div
                      className="rounded-xl border-2 text-center px-4 py-3 min-w-[110px]"
                      style={{ borderColor: step.color + "50", backgroundColor: step.color + "08" }}
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{step.label}</p>
                      <p className="text-xl font-bold mt-0.5" style={{ color: step.color }}>{step.value}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Mobile: vertical flow */}
              <div className="md:hidden space-y-1">
                {steps.map((step, i) => (
                  <div key={i}>
                    {/* Arrow with multiplier */}
                    {i > 0 && (
                      <div className="flex items-center gap-2 pl-8 py-0.5">
                        <div className="w-0.5 h-4 bg-gray-300 dark:bg-gray-600" />
                        <span className="text-xs font-bold" style={{ color: step.color }}>{step.multiplier}</span>
                        <span className="text-gray-400 text-xs">▼</span>
                      </div>
                    )}
                    {/* Step card */}
                    <div
                      className="flex items-center justify-between rounded-lg border-2 px-4 py-2.5"
                      style={{ borderColor: step.color + "40", backgroundColor: step.color + "06" }}
                    >
                      <span className="text-sm font-medium">{step.label}</span>
                      <span className="text-lg font-bold" style={{ color: step.color }}>{step.value}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Ratio bars: normalized to show relative multiplier effect */}
              <div className="mt-4">
                <p className="text-xs font-semibold text-muted-foreground mb-2">各段階の相対倍率（基盤雇用 = 1.0）</p>
                <div className="space-y-1.5">
                  {(() => {
                    const baseVal = Math.max(newBasicJobs, 1);
                    const ratios = [
                      { label: "基盤雇用", ratio: 1, color: "#2A9D8F" },
                      { label: "総雇用", ratio: deltaTotal / baseVal, color: "#3B82F6" },
                      { label: "人口", ratio: deltaPop / baseVal, color: "#8B5CF6" },
                      { label: "住戸需要", ratio: deltaHousing / baseVal, color: "#F59E0B" },
                    ];
                    const maxRatio = Math.max(...ratios.map((r) => Math.abs(r.ratio)), 1);
                    return ratios.map((r) => (
                      <div key={r.label} className="flex items-center gap-2">
                        <span className="text-xs w-20 text-right shrink-0">{r.label}</span>
                        <div className="flex-1 h-5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden relative">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.max((Math.abs(r.ratio) / maxRatio) * 100, 2)}%`,
                              backgroundColor: r.color,
                              opacity: 0.75,
                            }}
                          />
                          <span className="absolute inset-0 flex items-center justify-end pr-2 text-[10px] font-bold" style={{ color: r.color }}>
                            ×{r.ratio.toFixed(1)}
                          </span>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  人数ベースの波及効果を基盤雇用を1.0とした倍率で表示。延床面積・棟数は単位が異なるため除外。
                </p>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Feasibility */}
      <h3 className="text-lg font-semibold">開発フィジビリティ</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h4 className="font-medium text-sm mb-2">Front-door（需要側）</h4>
          <Card><CardContent className="pt-4 space-y-2 text-sm">
            <div className="flex justify-between"><span>必要延床面積</span><span className="font-bold">{feas.front_door.required_area_m2.toLocaleString()} m2</span></div>
            <div className="flex justify-between"><span>総開発コスト</span><span className="font-bold">¥{feas.front_door.total_dev_cost.toLocaleString()}</span></div>
            <div className="flex justify-between"><span>必要年間賃料</span><span className="font-bold">¥{feas.front_door.required_annual_rent.toLocaleString()}</span></div>
          </CardContent></Card>
        </div>
        <div>
          <h4 className="font-medium text-sm mb-2">Back-door（供給側）</h4>
          <Card><CardContent className="pt-4 space-y-2 text-sm">
            <div className="flex justify-between"><span>月額賃料単価</span><span className="font-bold">¥{feas.back_door.monthly_rent_per_m2.toLocaleString()}/m2</span></div>
            <div className="flex justify-between"><span>最大取得価格/戸</span><span className="font-bold">¥{feas.back_door.max_price_per_unit.toLocaleString()}</span></div>
            <div className="flex justify-between"><span>土地コスト比率</span><span className="font-bold">{feas.back_door.land_cost_ratio}%</span></div>
          </CardContent></Card>
        </div>
      </div>

      {/* Educational content */}
      <details open className="rounded-lg border p-4 text-sm text-muted-foreground">
        <summary className="font-medium cursor-pointer">ℹ️ 投資判断への活用</summary>
        <div className="mt-2 space-y-2">
          <p>
            経済基盤乗数（EBM）は基盤雇用1人が地域全体で何人の雇用を支えているかを示します。
            EBM = 5.0 なら、基盤産業の雇用が1人増えると地域全体で5人の雇用増加を意味します。
          </p>
          <p>
            人口雇用比率（PER）は就業者1人あたりの総人口です。
          </p>
          <p className="font-medium">需要予測の流れ:</p>
          <p>基盤雇用の変動 → ×EBM → 総雇用変動 → ×PER → 人口変動 → ÷世帯人員 → 住戸需要</p>
          <div className="font-mono text-xs mt-2 space-y-1">
            <p>計算式:</p>
            <ul className="list-disc list-inside">
              <li>EBM = 総雇用 ÷ 基盤雇用</li>
              <li>PER = 人口 ÷ 総雇用</li>
              <li>住戸需要 = 新規基盤雇用 × EBM × PER ÷ 世帯人員</li>
            </ul>
          </div>
          <p>
            基盤産業の工場誘致・撤退が地域の不動産需要にどう波及するかを定量予測できます。
          </p>
        </div>
      </details>
    </div>
  );
}
