"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PrefectureData } from "@/lib/use-prefecture-data";
import type { MunicipalityData } from "@/lib/use-municipality-data";
import { ECONOMIC_CENSUS_CURRENT, POPULATION_CENSUS_CURRENT } from "@/lib/data-versions";
import { DcfSection } from "@/components/dcf-section";
import { PricePredictionSection } from "@/components/price-prediction-section";
import { useGranularityProgression } from "@/lib/use-granularity-progression";
import { PopulationMomentumCard, type Census2025 } from "@/components/ui/population-momentum-card";
import { AreaDiagnosisPanel } from "@/components/ui/area-diagnosis-panel";
import { useMuniIndustryMatrixMid, computeCustomMetro, type CustomMetroResult } from "@/lib/use-muni-industry";
import { useCommuteZones, getZoneForMunicipality } from "@/lib/use-commute-zones";
import { PREFECTURES } from "@/lib/codes";
import { ebmHealthScore } from "@/lib/calc-score";

interface Props {
  pref: PrefectureData;
  selectedCity: MunicipalityData | null;
  prefCode?: number;
  municipalities?: MunicipalityData[];
  initialZoneCodes?: string[];
  centerCode?: string | null;
  onZoneChange?: (codes: string[]) => void;  // 経済圏選択を親に通知（全タブ共有用）
}

type PropertyType = "residential" | "commercial" | "office" | "industrial" | "medical";

interface PropertyScore {
  type: PropertyType;
  label: string;
  icon: string;
  totalScore: number;     // 0-100
  factors: Array<{
    label: string;
    score: number;        // 0-100
    weight: number;       // 0-1
    source: string;       // データソース
    interpretation: string;
  }>;
  verdict: "推奨" | "条件付推奨" | "様子見" | "回避";
  verdict_color: string;
  rationale: string[];    // クライアント説明用の根拠リスト
  risks: string[];        // 留意すべきリスク
}

const verdictColor = (score: number) =>
  score >= 70 ? { label: "推奨", color: "#2A9D8F" } :
  score >= 50 ? { label: "条件付推奨", color: "#D4A843" } :
  score >= 30 ? { label: "様子見", color: "#F59E0B" } :
  { label: "回避", color: "#E76F51" };

/** 経済圏の複数市区町村から census2025 を集計する */
function aggregateEconZoneCensus(
  municipalities: MunicipalityData[],
  codes: Set<string>,
): Census2025 | null {
  let pop = 0, pop2020 = 0, hh = 0, area = 0, count = 0;
  let natPct = 0;
  for (const m of municipalities) {
    if (!codes.has(m.area_code) || !m.census2025) continue;
    pop += m.census2025.population;
    pop2020 += m.census2025.population_2020;
    hh += m.census2025.households;
    area += m.census2025.density > 0 ? m.census2025.population / m.census2025.density : 0;
    natPct = m.census2025.national_pop_change_pct; // 全国値は共通
    count++;
  }
  if (count === 0 || pop2020 === 0) return null;
  const popPct = ((pop - pop2020) / pop2020) * 100;
  // 世帯の2020年推計: 2025世帯数を人口増減率で逆算（簡易）
  const hh2020 = pop2020 > 0 ? Math.round(hh / (1 + popPct / 100 * 0.5)) : 0;
  const hhPct = hh2020 > 0 ? ((hh - hh2020) / hh2020) * 100 : 0;
  const gap = popPct - natPct;
  const cls: Census2025["momentum_class"] =
    popPct >= 0 && gap >= 0 ? "growth" :
    popPct >= 0 && gap < 0 ? "resilient" :
    popPct < 0 && gap >= 0 ? "outperform_decline" :
    popPct < 0 && popPct > -5 ? "decline" : "severe_decline";
  const density = area > 0 ? pop / area : 0;
  return {
    population: pop,
    population_2020: pop2020,
    households: hh,
    pop_change_pct: Math.round(popPct * 100) / 100,
    hh_change_pct: Math.round(hhPct * 100) / 100,
    national_pop_change_pct: natPct,
    momentum_gap: Math.round(gap * 100) / 100,
    momentum_class: cls,
    density: Math.round(density * 10) / 10,
    source: `経済圏合算（${count}市区町村, 2025国勢調査速報）`,
  };
}

/** 各物件タイプの統合スコアを計算 */
function calculatePropertyScores(pref: PrefectureData, city: MunicipalityData | null, econZone?: CustomMetroResult | null, econZoneCensus?: Census2025 | null): PropertyScore[] {
  // 経済圏モード時は経済圏の値を優先
  const ebm = econZone ? econZone.ebm : (pref.ebm_mid ?? pref.ebm);
  const basicRatio = econZone ? econZone.basic_ratio : (pref.basic_ratio_mid ?? pref.basic_ratio);
  const rsTotal = pref.rs_total_mid ?? pref.rs_total; // RSは都道府県（経済圏合算未対応）
  const gapFactor = pref.aggregate_gap_factor;
  const popChange20y = pref.pop_change_pct ?? 0;
  const popChange10y = pref.pop_change_10y_pct ?? 0;
  // 2025国勢調査の直近実測モメンタム（経済圏→市区町村→都道府県の優先順）
  const recentC = econZoneCensus ?? city?.census2025 ?? pref.census2025;
  const recentPct = recentC?.pop_change_pct ?? null;
  const recentGap = recentC?.momentum_gap ?? null;
  const projScore20 = Math.max(0, Math.min(100, 50 + popChange20y * 3));
  const recentScore = recentGap != null ? Math.max(0, Math.min(100, 50 + recentGap * 6)) : projScore20;
  const popDynScore = recentPct != null ? Math.round(0.5 * projScore20 + 0.5 * recentScore) : projScore20;
  const popDynInterp = recentPct != null
    ? "実測 " + (recentPct >= 0 ? "+" : "") + recentPct.toFixed(1) + "%(20\u201925" + (recentGap != null ? ",全国比" + (recentGap >= 0 ? "+" : "") + recentGap.toFixed(1) + "pt" : "") + ") / 推計 " + (popChange20y >= 0 ? "+" : "") + popChange20y.toFixed(1) + "%(20年)"
    : "20年変化 " + (popChange20y >= 0 ? "+" : "") + popChange20y.toFixed(1) + "%";
  const agingProj = Math.max(0, Math.min(100, -popChange20y * 3 + 30));
  const agingRecent = recentPct != null ? Math.max(0, Math.min(100, -recentPct * 4 + 40)) : agingProj;
  const agingScore = recentPct != null ? Math.round(0.5 * agingProj + 0.5 * agingRecent) : agingProj;
  const agingInterp = "直近" + (recentPct != null ? (recentPct >= 0 ? "+" : "") + recentPct.toFixed(1) + "%" : "\u2014") + "/20年" + popChange20y.toFixed(1) + "%(減少=高齢化=需要増)";
  const floodRisk = (city?.flood_risk_pct ?? pref.flood_risk_avg_pct ?? 0);
  const landPrice = city?.land_price_median ?? pref.land_price_median_l01 ?? 0;
  const carDep = city?.car_dependency_score ?? 50;
  const numStations = city?.num_stations ?? 0;
  const dailyRiders = city?.daily_riders ?? pref.total_daily_riders ?? 0;
  const segment = city?.segment;
  const hasLocationPlan = city?.has_location_plan ?? (pref.has_location_plan_count ?? 0) > 0;
  const hasResidentialZone = city?.has_residential_zone ?? false;
  const hasFunctionZone = city?.has_function_zone ?? false;
  const lqIndustries = pref.top_lq_industries;

  // 経済基盤の健全性（EBM 3-6 で最大）— calc-score.ts の単一定義に統一（P1 閾値ズレ解消）
  const economicHealth = ebmHealthScore(ebm);

  // 多角化（基盤雇用比率 15-25% で最大）
  const diversification =
    basicRatio >= 15 && basicRatio <= 25 ? 100 :
    basicRatio >= 10 && basicRatio <= 30 ? 70 :
    40;

  // 成長性（RS + 10年人口変化）
  const growthRaw = (rsTotal / 1000) + popChange10y * 2 + (recentGap ?? 0) * 1.5;
  const growth = Math.max(0, Math.min(100, 50 + growthRaw * 2));

  // リスク（洪水）
  const flood = Math.max(0, 100 - floodRisk * 2);

  // 商業需要(Gap)
  const commercialDemand = Math.max(0, Math.min(100, 50 + gapFactor));

  // アクセス性
  const transitDensity = numStations >= 5 || dailyRiders > 100000 ? 90 : numStations >= 2 ? 60 : 30;
  const accessScore = Math.max(0, 100 - carDep * 0.7);

  // 特化産業判定
  const hasOfficeIndustry = lqIndustries.some(i =>
    ["情報通信業", "金融業，保険業", "学術研究，専門・技術サービス業", "不動産業，物品賃貸業"].includes(i.industry) && i.lq > 1.2
  );
  const hasIndustrial = lqIndustries.some(i =>
    ["製造業", "運輸業，郵便業", "建設業"].includes(i.industry) && i.lq > 1.1
  );
  const hasRetail = lqIndustries.some(i =>
    ["卸売業，小売業", "宿泊業，飲食サービス業"].includes(i.industry) && i.lq > 1.1
  );
  const hasMedical = lqIndustries.some(i => i.industry === "医療，福祉" && i.lq > 1.05);

  // ====== 1. 住居系 ======
  const residentialFactors = [
    { label: "経済基盤", score: economicHealth, weight: 0.15, source: "EBM/基盤雇用比率", interpretation: `EBM ${ebm.toFixed(1)} / 基盤率 ${basicRatio.toFixed(1)}%` },
    { label: "人口動態", score: popDynScore, weight: 0.30, source: "国勢2025実測+社人研推計", interpretation: popDynInterp },
    { label: "災害リスク", score: flood, weight: 0.20, source: "国土数値情報 A31", interpretation: `浸水面積率 ${floodRisk.toFixed(1)}%` },
    { label: "交通アクセス", score: accessScore, weight: 0.20, source: "OSRM + 鉄道駅", interpretation: city?.nearest_station_min != null ? `最寄り駅まで${city.nearest_station_min}分` : `車依存度 ${carDep}` },
    {
      label: "立地適正化",
      score: hasResidentialZone ? 100 : hasLocationPlan ? 70 : 50,
      weight: 0.15,
      source: "国土数値情報 A35/A50",
      interpretation: hasResidentialZone ? "✓ 居住誘導区域あり(住宅投資追い風)" :
                      hasFunctionZone ? "都市機能誘導のみ(住宅は限定的)" :
                      hasLocationPlan ? "計画策定済(区域不明)" : "未策定",
    },
  ];
  const residentialScore = residentialFactors.reduce((s, f) => s + f.score * f.weight, 0);

  // ====== 2. 商業系 ======
  const commercialFactors = [
    { label: "商業需要(Gap)", score: commercialDemand, weight: 0.22, source: "小売漏損係数", interpretation: `${gapFactor > 0 ? "漏損" : "余剰"} ${Math.abs(gapFactor).toFixed(1)}` },
    { label: "商業セクター集積", score: hasRetail ? 85 : 40, weight: 0.18, source: "LQ分析", interpretation: hasRetail ? "卸売小売/宿泊飲食 LQ>1.1" : "商業特化弱い" },
    { label: "交通利便性", score: transitDensity, weight: 0.18, source: "NLNI 鉄道", interpretation: `駅${numStations}箇所、乗降客${(dailyRiders/10000).toFixed(0)}万人/日` },
    { label: "昼間人口比", score: Math.min(100, 100 * pref.daytime_population / Math.max(pref.population, 1)), weight: 0.12, source: "昼間/夜間人口比", interpretation: `${(pref.daytime_population / Math.max(pref.population, 1) * 100).toFixed(0)}%` },
    {
      label: "都市機能誘導区域",
      score: hasFunctionZone ? 100 : hasLocationPlan ? 60 : 50,
      weight: 0.10,
      source: "国土数値情報 A35/A50",
      interpretation: hasFunctionZone ? "✓ 都市機能誘導区域あり(商業・公共投資の追い風)" :
                      hasResidentialZone ? "居住誘導のみ(商業は限定的)" :
                      hasLocationPlan ? "計画策定済(区域不明)" : "未策定",
    },
    { label: "災害リスク", score: flood, weight: 0.10, source: "国土数値情報 A31", interpretation: `浸水${floodRisk.toFixed(1)}%` },
    { label: "経済成長", score: growth, weight: 0.10, source: "RS+人口変化", interpretation: `RS ${rsTotal >= 0 ? "+" : ""}${(rsTotal/1000).toFixed(0)}k` },
  ];
  const commercialScore = commercialFactors.reduce((s, f) => s + f.score * f.weight, 0);

  // ====== 3. オフィス ======
  const officeFactors = [
    { label: "オフィス系産業集積", score: hasOfficeIndustry ? 90 : 30, weight: 0.30, source: "LQ分析", interpretation: hasOfficeIndustry ? "情報/金融/専門サービス LQ>1.2" : "オフィス特化弱い" },
    { label: "経済基盤の質", score: economicHealth, weight: 0.20, source: "EBM/基盤雇用比率", interpretation: `EBM ${ebm.toFixed(1)}` },
    { label: "競争力(RS)", score: growth, weight: 0.20, source: "シフトシェア", interpretation: `${pref.top_rs_industry || "—"} 牽引` },
    { label: "規模(雇用)", score: Math.min(100, pref.total_employment / 30000), weight: 0.15, source: "総雇用", interpretation: `${(pref.total_employment/10000).toFixed(0)}万人雇用` },
    { label: "交通利便", score: transitDensity, weight: 0.15, source: "NLNI 鉄道", interpretation: `駅${numStations}箇所` },
  ];
  const officeScore = officeFactors.reduce((s, f) => s + f.score * f.weight, 0);

  // ====== 4. 物流・工業 ======
  const industrialFactors = [
    { label: "工業系産業集積", score: hasIndustrial ? 85 : 40, weight: 0.25, source: "LQ分析", interpretation: hasIndustrial ? "製造/運輸/建設 LQ>1.1" : "工業特化弱い" },
    { label: "経済基盤", score: economicHealth, weight: 0.15, source: "EBM", interpretation: `EBM ${ebm.toFixed(1)}` },
    { label: "土地コスト", score: Math.max(0, 100 - landPrice / 5000), weight: 0.20, source: "地価公示", interpretation: `中央値 ${landPrice > 0 ? `${(landPrice/10000).toFixed(0)}万円/m²` : "—"}` },
    { label: "車アクセス", score: Math.min(100, carDep * 1.2), weight: 0.20, source: "OSRM 車依存度", interpretation: `スコア ${carDep}（高=幹線道路アクセス可能性）` },
    { label: "リスク", score: flood, weight: 0.20, source: "浸水想定", interpretation: `${floodRisk.toFixed(1)}%` },
  ];
  const industrialScore = industrialFactors.reduce((s, f) => s + f.score * f.weight, 0);

  // ====== 5. 医療・介護 ======
  const medicalFactors = [
    { label: "医療セクター集積", score: hasMedical ? 85 : 40, weight: 0.25, source: "LQ分析", interpretation: hasMedical ? "医療福祉 LQ>1.05" : "弱い" },
    { label: "高齢化進度", score: agingScore, weight: 0.30, source: "国勢2025実測+社人研", interpretation: agingInterp },
    { label: "アクセス", score: accessScore, weight: 0.15, source: "OSRM", interpretation: `車依存度 ${carDep}` },
    { label: "競争(既存施設)", score: city?.num_medical != null ? Math.max(0, 100 - Math.min(100, city.num_medical / 5)) : 60, weight: 0.15, source: "NLNI 医療施設数", interpretation: city?.num_medical != null ? `既存 ${city.num_medical}施設` : "市区町村未選択" },
    { label: "災害リスク", score: flood, weight: 0.15, source: "浸水想定", interpretation: `${floodRisk.toFixed(1)}%` },
  ];
  const medicalScore = medicalFactors.reduce((s, f) => s + f.score * f.weight, 0);

  // 根拠とリスクのテキスト生成
  const buildRationaleAndRisks = (
    type: PropertyType, score: number, factors: typeof residentialFactors,
  ): { rationale: string[]; risks: string[] } => {
    const rationale: string[] = [];
    const risks: string[] = [];

    // 最強要因 TOP 2
    const sortedByScore = [...factors].sort((a, b) => b.score - a.score);
    for (const f of sortedByScore.slice(0, 2)) {
      if (f.score >= 60) rationale.push(`✓ ${f.label}: ${f.interpretation}（${f.source}）`);
    }
    // 最弱要因 TOP 2
    for (const f of sortedByScore.slice(-2).reverse()) {
      if (f.score < 50) risks.push(`✗ ${f.label}: ${f.interpretation}（${f.source}）`);
    }
    // セグメント関連の追加根拠
    if (segment) {
      const matchingSegment: Record<PropertyType, string[]> = {
        residential: ["都市サービス集積型", "公務・教育型"],
        commercial: ["商業・観光型", "都市サービス集積型"],
        office: ["都市サービス集積型"],
        industrial: ["工業基盤型"],
        medical: ["公務・教育型", "高齢縮小型"],
      };
      if (matchingSegment[type].includes(segment)) {
        rationale.push(`✓ 市区町村セグメント「${segment}」と物件タイプが整合`);
      }
    }
    // 通勤歪み
    if (pref.commute_distortion === "outflow") {
      risks.push(`⚠ ベッドタウン特性: 都市圏全体での再評価を推奨`);
    } else if (pref.commute_distortion === "inflow" && type === "residential") {
      risks.push(`⚠ 通勤流入で住民あたり指標が見えにくい`);
    }
    return { rationale, risks };
  };

  const makeScore = (
    type: PropertyType,
    label: string,
    icon: string,
    totalScore: number,
    factors: typeof residentialFactors,
  ): PropertyScore => {
    const v = verdictColor(totalScore);
    const ra = buildRationaleAndRisks(type, totalScore, factors);
    return {
      type, label, icon, totalScore, factors,
      verdict: v.label as PropertyScore["verdict"],
      verdict_color: v.color,
      rationale: ra.rationale,
      risks: ra.risks,
    };
  };

  return [
    makeScore("residential", "住居系（マンション・アパート）", "🏘️", residentialScore, residentialFactors),
    makeScore("commercial", "商業系（店舗・SC）", "🛒", commercialScore, commercialFactors),
    makeScore("office", "オフィスビル", "🏢", officeScore, officeFactors),
    makeScore("industrial", "物流倉庫・工業", "🏭", industrialScore, industrialFactors),
    makeScore("medical", "医療・介護施設", "🏥", medicalScore, medicalFactors),
  ].sort((a, b) => b.totalScore - a.totalScore);
}

/* ── 推奨経済圏プリセット（投資判断ハブ用） ── */
interface ZonePreset { name: string; prefCodes: number[]; codes: string[] }
const ZONE_PRESETS: ZonePreset[] = [
  { name: "都心5区", prefCodes: [13], codes: ["13101","13102","13103","13104","13113"] },
  { name: "都心8区", prefCodes: [13], codes: ["13101","13102","13103","13104","13113","13105","13106","13116"] },
  { name: "城南4区", prefCodes: [13], codes: ["13109","13110","13111","13112"] },
  { name: "城北3区", prefCodes: [13], codes: ["13117","13119","13120"] },
  { name: "城東7区", prefCodes: [13], codes: ["13107","13108","13106","13118","13121","13122","13123"] },
  { name: "23区全域", prefCodes: [13], codes: Array.from({length:23},(_,i)=>`13${101+i}`) },
  { name: "横浜・川崎", prefCodes: [14], codes: ["14101","14102","14103","14104","14105","14106","14107","14108","14109","14110","14111","14112","14113","14114","14115","14116","14117","14118","14131","14132","14133","14134","14135","14136","14137"] },
  { name: "大阪市", prefCodes: [27], codes: ["27102","27103","27104","27106","27107","27108","27109","27111","27113","27114","27115","27116","27117","27118","27119","27120","27121","27122","27123","27124","27125","27126","27127","27128"] },
  { name: "名古屋市", prefCodes: [23], codes: ["23101","23102","23103","23104","23105","23106","23107","23108","23109","23110","23111","23112","23113","23114","23115","23116"] },
  { name: "福岡市", prefCodes: [40], codes: ["40131","40132","40133","40134","40135","40136","40137"] },
  { name: "札幌市", prefCodes: [1], codes: ["01101","01102","01103","01104","01105","01106","01107","01108","01109","01110"] },
];

export default function DecisionHubTab({ pref, selectedCity, prefCode, municipalities, initialZoneCodes, centerCode, onZoneChange }: Props) {
  // 経済圏モード（URLに?zone=または?center=がある場合は経済圏モードで起動）
  const hasInitialZone = (initialZoneCodes && initialZoneCodes.length > 0) || !!centerCode;
  const [analysisMode, setAnalysisMode] = useState<"single" | "econ_zone">(hasInitialZone ? "econ_zone" : "single");
  const [econZoneCodes, setEconZoneCodes] = useState<Set<string>>(new Set(initialZoneCodes ?? []));
  const [ezFilterPref, setEzFilterPref] = useState<number>(prefCode ?? pref.pref_code);
  const { matrix: matrixMid, loading: matrixMidLoading, error: matrixMidError } = useMuniIndustryMatrixMid(analysisMode === "econ_zone");
  const { data: commuteZones } = useCommuteZones();

  // ?center= パラメータからの自動経済圏設定（commuteZonesロード後に1回だけ実行）
  const [centerApplied, setCenterApplied] = useState(false);
  useEffect(() => {
    if (!centerCode || !commuteZones || centerApplied) return;
    const zoneResult = getZoneForMunicipality(commuteZones, centerCode);
    if (zoneResult) {
      setEconZoneCodes(new Set(zoneResult.zone.all));
      setAnalysisMode("econ_zone");
      setCenterApplied(true);
    } else {
      // 政令市の区コードの場合のフォールバック
      const cityBase = centerCode.slice(0, 2) + "100";
      if (DESIGNATED_CITY_CODES.has(cityBase)) {
        const baseResult = getZoneForMunicipality(commuteZones, cityBase);
        if (baseResult) {
          setEconZoneCodes(new Set(baseResult.zone.all));
          setAnalysisMode("econ_zone");
          setCenterApplied(true);
        }
      }
    }
  }, [centerCode, commuteZones, centerApplied]);

  // 経済圏動的生成のUI状態（トップレベルに配置 — Rules of Hooks遵守）
  const [zoneLoading, setZoneLoading] = useState(false);
  const [zoneMethod, setZoneMethod] = useState<string | null>(null);
  const [zoneCount, setZoneCount] = useState<number | null>(null);
  const [zoneError, setZoneError] = useState<string | null>(null);

  const fetchZone = useCallback(async (url: string, label: string) => {
    if (zoneLoading) return;
    setZoneLoading(true);
    setZoneMethod(label);
    setZoneCount(null);
    setZoneError(null);
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setEconZoneCodes(new Set(data.zone));
        setZoneCount(data.zone.length);
      } else {
        setZoneError(`エラー: ${res.status}`);
      }
    } catch (e) {
      console.error("[commute-zone]", e);
      setZoneError("通信エラー。再度お試しください。");
    } finally {
      setZoneLoading(false);
    }
  }, [zoneLoading, setEconZoneCodes]);

  // 都道府県切替時にeconZoneCodesをリセット（staleなcross-pref selectionを防止）
  const prevPrefRef = useRef(prefCode);
  useEffect(() => {
    if (prefCode !== prevPrefRef.current) {
      setEconZoneCodes(new Set());
      setEzFilterPref(prefCode ?? pref.pref_code);
      setZoneMethod(null);
      setZoneCount(null);
    }
    prevPrefRef.current = prefCode;
  }, [prefCode, pref.pref_code]);

  // 経済圏選択が変わったら親に通知
  useEffect(() => {
    if (onZoneChange && analysisMode === "econ_zone") {
      onZoneChange(Array.from(econZoneCodes));
    } else if (onZoneChange && analysisMode === "single") {
      onZoneChange([]);
    }
  }, [econZoneCodes, analysisMode, onZoneChange]);

  // 政令指定都市の区コード一覧（区コード→市コードのフォールバック用）
  // 政令市の区は XX1XX 形式で XX100 が市コード
  const DESIGNATED_CITY_CODES = new Set([
    "01100","04100","11100","12100","13100","14100","14130",
    "15100","22100","23100","26100","27100","28100",
    "33100","34100","40100","40130","43100",
  ]);

  // 選択中の市区町村が所属する通勤経済圏（自動提案用）
  const autoZone = (() => {
    if (!commuteZones) return null;
    const code = selectedCity?.area_code ?? String(prefCode ?? pref.pref_code).padStart(2, "0") + "000";
    // 市区町村コードで直接検索
    const result = getZoneForMunicipality(commuteZones, code);
    if (result) return result;
    // 政令市の区コード（XX1XX）→ 市コード（XX100）で再検索
    // ただし政令指定都市の区のみ（一般市の誤マッチを防止）
    if (code.length === 5 && !code.endsWith("000")) {
      const cityBase = code.slice(0, 2) + "100";
      if (DESIGNATED_CITY_CODES.has(cityBase)) {
        return getZoneForMunicipality(commuteZones, cityBase);
      }
    }
    return null;
  })();
  const econZoneResult = useMemo(() => {
    if (analysisMode !== "econ_zone" || !matrixMid || econZoneCodes.size === 0) return null;
    return computeCustomMetro(matrixMid, Array.from(econZoneCodes));
  }, [analysisMode, matrixMid, econZoneCodes]);
  const econZoneNames = useMemo(() => {
    if (!matrixMid) return "";
    return Array.from(econZoneCodes).map(c => matrixMid[c]?.area_name ?? c).join("・");
  }, [matrixMid, econZoneCodes]);

  // 経済圏の census2025 集計（人口モメンタム用）
  const econZoneCensus = useMemo(() => {
    if (analysisMode !== "econ_zone" || econZoneCodes.size === 0 || !municipalities?.length) return null;
    return aggregateEconZoneCensus(municipalities, econZoneCodes);
  }, [analysisMode, econZoneCodes, municipalities]);

  // 粒度進行データ (AI プロンプト + UI 用)
  const { data: granularityData } = useGranularityProgression(pref.pref_code);
  const scores = useMemo(
    () => calculatePropertyScores(pref, selectedCity, analysisMode === "econ_zone" ? econZoneResult : null, analysisMode === "econ_zone" ? econZoneCensus : null),
    [pref, selectedCity, analysisMode, econZoneResult, econZoneCensus],
  );
  const target = analysisMode === "econ_zone" && econZoneNames
    ? `経済圏: ${econZoneNames.length > 30 ? econZoneNames.slice(0, 30) + "…" : econZoneNames}（${econZoneCodes.size}市区町村）`
    : selectedCity ? `${pref.pref_name} ${selectedCity.area_name}` : pref.pref_name;
  const best = scores[0];
  const momentumC = econZoneCensus ?? selectedCity?.census2025 ?? pref.census2025;

  // AI 自然言語化（4層ガードレール対応）
  interface AiWarning {
    level: "high" | "medium" | "low";
    pattern: string;
    category: string;
    context: string;
  }
  interface AiMeta {
    model: string;
    generated_at: string;
    latency_ms: number;
    temperature: number;
    warnings_count: number;
    high_warnings: number;
  }
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiWarnings, setAiWarnings] = useState<AiWarning[]>([]);
  const [aiMeta, setAiMeta] = useState<AiMeta | null>(null);
  const [aiDisclaimer, setAiDisclaimer] = useState<string>("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiEdited, setAiEdited] = useState<string | null>(null);  // 編集後テキスト
  const runAi = async () => {
    setAiLoading(true);
    setAiError(null);
    setAiResult(null);
    setAiWarnings([]);
    setAiMeta(null);
    setAiEdited(null);
    try {
      const r = await fetch("/api/ai-decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target,
          bestType: best.label,
          bestScore: best.totalScore,
          bestVerdict: best.verdict,
          rationale: best.rationale,
          risks: best.risks,
          allScores: scores.map(s => ({
            label: s.label,
            score: s.totalScore,
            verdict: s.verdict,
            factors: s.factors.map(f => ({
              label: f.label, score: f.score, weight: f.weight, interpretation: f.interpretation,
            })),
          })),
          commuteDistortion: pref.commute_distortion,
          segment: selectedCity?.segment,
          // 中分類シフトシェアからの追加コンテキスト (具体的な業種粒度)
          shiftShareMajor: pref.top_rs_industry ? {
            topIndustry: pref.top_rs_industry,
            topValue: pref.top_rs_value,
            rsTotal: pref.rs_total,
          } : null,
          shiftShareMid: pref.top_rs_industry_mid ? {
            topIndustry: pref.top_rs_industry_mid,
            topValue: pref.top_rs_value_mid,
            rsTotal: pref.rs_total_mid,
          } : null,
          // 粒度進行 (Mulligan凸性質)
          granularity: granularityData ? {
            ebmL0: granularityData.levels[0].ebm,
            ebmL1: granularityData.levels[1].ebm,
            ebmL2: granularityData.levels[2].ebm,
            inTextbookRange: granularityData.in_textbook_range,
            compressionPct: granularityData.compression_pct,
          } : null,
          // 経済圏モードの場合、合算データを含める
          econZone: analysisMode === "econ_zone" && econZoneResult ? {
            mode: "economic_zone",
            municipalities: econZoneCodes.size,
            names: econZoneNames,
            ebm: econZoneResult.ebm,
            basicRatio: econZoneResult.basic_ratio,
            basicEmployment: econZoneResult.basic_employment,
            totalEmployment: econZoneResult.total_employment,
            nBasicIndustries: econZoneResult.n_basic_industries,
          } : null,
        }),
      });
      const data = await r.json();
      if (data.error) {
        setAiError(data.error);
      } else {
        setAiResult(data.analysis);
        setAiWarnings(data.warnings ?? []);
        setAiMeta(data.meta ?? null);
        setAiDisclaimer(data.disclaimer ?? "");
      }
    } catch (e) {
      setAiError(String(e));
    } finally {
      setAiLoading(false);
    }
  };
  const copyToClipboard = async () => {
    const text = aiEdited ?? aiResult ?? "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text + "\n\n---\n" + aiDisclaimer);
      alert("レポートと免責事項をクリップボードにコピーしました");
    } catch {
      alert("コピーに失敗しました");
    }
  };

  /**
   * PDF出力 — print用CSSを一時的に有効化し window.print() を呼ぶ。
   * ブラウザの「PDFとして保存」を使うことで Vercel 環境でも追加インフラ不要。
   * print:* Tailwindクラスで非印刷要素を非表示、印刷時のみ最適レイアウトに切替。
   */
  const exportPdf = () => {
    // print用クラスをbodyに付けて条件分岐
    document.body.classList.add("printing-decision-hub");
    window.print();
    // afterprintイベント or タイムアウトでクラス削除
    setTimeout(() => document.body.classList.remove("printing-decision-hub"), 500);
  };

  return (
    <div className="space-y-6">
      {/* 印刷時のみ表示するレポートヘッダ */}
      <div className="print-only border-b-2 pb-3 mb-3">
        <h1 className="text-2xl font-bold">不動産市場分析レポート</h1>
        <p className="text-sm mt-1">対象エリア: <strong>{target}</strong></p>
        <p className="text-xs mt-1">生成日: {new Date().toLocaleString("ja-JP")}</p>
        <p className="text-xs mt-1">分析基準: CCIM CI102 不動産投資のための市場分析（経済基盤分析・シフトシェア・小売ギャップ・空間データ統合）</p>
        <p className="text-xs mt-1 text-gray-700">
          データ出典: e-Stat {ECONOMIC_CENSUS_CURRENT.labelFull} / {POPULATION_CENSUS_CURRENT.labelFull} / MLIT不動産情報ライブラリ / 国土数値情報NLNI / 社人研人口予測
        </p>
      </div>

      <div>
        <h2 className="text-xl font-bold mb-2">投資判断ハブ</h2>
        <p className="text-sm text-gray-700">
          エリアの需要・供給・将来性を政府統計から定量評価し、<strong>5つの物件タイプ別</strong>に投資適格度を判定します。
        </p>
      </div>

      {/* ── 分析モード切替（単一地域 / 経済圏） ── */}
      <div className="rounded-xl border-2 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 p-4">
        <div className="flex items-center gap-3 flex-wrap mb-2">
          <span className="text-sm font-bold">分析モード:</span>
          <div className="inline-flex rounded-lg border overflow-hidden">
            <button
              className={`px-4 py-1.5 text-sm font-bold transition-colors ${analysisMode === "single" ? "bg-blue-600 text-white" : "bg-white dark:bg-slate-800 hover:bg-blue-50"}`}
              onClick={() => setAnalysisMode("single")}
            >単一地域</button>
            <button
              className={`px-4 py-1.5 text-sm font-bold transition-colors ${analysisMode === "econ_zone" ? "bg-blue-600 text-white" : "bg-white dark:bg-slate-800 hover:bg-blue-50"}`}
              onClick={() => setAnalysisMode("econ_zone")}
            >経済圏（複数地域）</button>
          </div>
        </div>

        {analysisMode === "single" ? (
          <p className="text-xs text-muted-foreground">
            サイドバーで選択した <strong>{selectedCity ? `${pref.pref_name} ${selectedCity.area_name}` : pref.pref_name}</strong> を分析中。
            行政区単体ではEBMが過大になる場合があります。より正確な分析には「経済圏」モードを使用してください。
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              通勤圏・生活圏に合わせた<strong>複数の市区町村を合算</strong>して分析します。行政区を超えた一体的な経済圏で評価することで、EBMの精度が向上します。
            </p>
            {matrixMidLoading && (
              <p className="text-xs text-blue-700 font-bold animate-pulse">中分類95業種データを読み込み中...</p>
            )}
            {matrixMidError && (
              <p className="text-xs text-red-700 font-bold">データ読み込みエラー: {matrixMidError}。ページを再読み込みしてください。</p>
            )}
            {/* 通勤経済圏（自動提案） */}
            {autoZone && (
              <div className="rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 p-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">推奨経済圏（通勤流動ベース）:</span>
                  <button
                    onClick={() => setEconZoneCodes(new Set(autoZone.zone.all))}
                    className={`rounded-lg border-2 px-3 py-1.5 text-xs font-bold transition-colors ${
                      autoZone.zone.all.length === econZoneCodes.size && autoZone.zone.all.every(c => econZoneCodes.has(c))
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-white dark:bg-slate-800 border-emerald-400 hover:bg-emerald-50 text-emerald-800 dark:text-emerald-300"
                    }`}
                  >
                    {autoZone.zone.name}（{autoZone.zone.type}・{autoZone.zone.all.length}市区町村）
                  </button>
                </div>
                <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                  東大CSIS 都市雇用圏（2020年国勢調査ベース）。通勤者の10%以上が中心市に通勤する市区町村で構成。
                </p>
              </div>
            )}

            {/* 閾値カスタム + Louvain（通勤OD行列ベース） */}
            <details className="text-xs">
            <summary className="cursor-pointer font-bold text-indigo-700 dark:text-indigo-400 mb-1">通勤率・AI検出で経済圏をカスタム生成する</summary>
            {(() => {
              // 市区町村 or 都道府県コードから代表コードを決定
              const centerCode = selectedCity?.area_code ?? `${String(prefCode ?? pref.pref_code).padStart(2, "0")}000`;
              // 都道府県コード(XX000)の場合は県庁所在地の代表コードを使用
              const apiCenter = centerCode.endsWith("000")
                ? `${centerCode.slice(0, 2)}100`  // 政令市 or 県庁所在地の推定
                : centerCode;
              return (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/20 p-2.5 space-y-2">
                {/* 通勤率ベース */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-indigo-800 dark:text-indigo-300">通勤率:</span>
                  {[5, 10, 15, 25].map((t) => (
                    <button
                      key={t}
                      disabled={zoneLoading}
                      onClick={() => fetchZone(`/api/commute-zone?center=${apiCenter}&threshold=${t}`, `通勤率${t}%`)}
                      className={`rounded border px-2.5 py-1 text-xs font-bold transition-colors ${zoneLoading ? "opacity-50 cursor-wait" : "hover:bg-indigo-100"} ${zoneMethod === `通勤率${t}%` ? "bg-indigo-600 text-white border-indigo-600" : ""}`}
                    >{t}%</button>
                  ))}
                  <span className="text-xs text-muted-foreground">低い=広い / 高い=狭い</span>
                </div>

                {/* Louvain */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-indigo-800 dark:text-indigo-300">AI検出:</span>
                  {(["0.5", "1.0", "2.0", "3.0"] as const).map((res) => {
                    const label = res === "0.5" ? "細かい" : res === "1.0" ? "標準" : res === "2.0" ? "広域" : "超広域";
                    const methodLabel = `Louvain ${label}`;
                    return (
                      <button
                        key={res}
                        disabled={zoneLoading}
                        onClick={() => fetchZone(`/api/commute-zone?center=${apiCenter}&method=louvain&resolution=${res}`, methodLabel)}
                        className={`rounded border px-2 py-1 text-xs font-bold transition-colors ${zoneLoading ? "opacity-50 cursor-wait" : "hover:bg-indigo-100"} ${zoneMethod === methodLabel ? "bg-indigo-600 text-white border-indigo-600" : ""}`}
                      >{label}</button>
                    );
                  })}
                </div>

                {/* 状態表示 */}
                {zoneLoading && (
                  <p className="text-xs text-indigo-700 font-bold animate-pulse">経済圏を計算中...</p>
                )}
                {zoneError && (
                  <p className="text-xs text-red-700 font-bold">{zoneError}</p>
                )}
                {!zoneLoading && !zoneError && zoneMethod && zoneCount != null && (
                  <p className="text-xs font-bold text-indigo-800 dark:text-indigo-300">
                    {zoneMethod} → <strong>{zoneCount}市区町村</strong>を選択しました
                  </p>
                )}

                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p><strong>通勤率</strong> = この物件の影響範囲。選んだ地域を中心に「住民の○%以上が通勤する先」を放射的に追加。</p>
                  <p><strong>AI検出</strong> = この街の経済的な仲間。全国の通勤ネットワークから「互いに行き来が多いグループ」を自動検出。</p>
                </div>
              </div>
              );
            })()}
            </details>

            {/* プリセット（選択中の都道府県に関連するもののみ表示） */}
            <div className="flex flex-wrap gap-1.5">
              {ZONE_PRESETS.filter((p) => p.prefCodes.includes(prefCode ?? pref.pref_code)).length === 0 && (
                <p className="text-xs text-muted-foreground">この都道府県のプリセットはありません。下の手動選択で市区町村を選んでください。</p>
              )}
              {ZONE_PRESETS.filter((p) => p.prefCodes.includes(prefCode ?? pref.pref_code)).map((p) => (
                <button
                  key={p.name}
                  onClick={() => setEconZoneCodes(new Set(p.codes))}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors ${
                    p.codes.length === econZoneCodes.size && p.codes.every(c => econZoneCodes.has(c))
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white dark:bg-slate-800 hover:bg-blue-50 hover:border-blue-300"
                  }`}
                  title={`${p.codes.length}市区町村`}
                >{p.name}</button>
              ))}
            </div>
            {/* 手動選択 */}
            <details className="text-xs">
              <summary className="cursor-pointer font-bold text-blue-700 dark:text-blue-400">手動で市区町村を追加・除外する</summary>
              <div className="mt-2 space-y-2">
                <div className="flex gap-2 items-center">
                  <select value={ezFilterPref} onChange={(e) => setEzFilterPref(Number(e.target.value))} className="rounded px-2 py-1 text-xs border">
                    {Object.entries(PREFECTURES).map(([code, name]) => (
                      <option key={code} value={code}>{String(code).padStart(2, "0")} {name}</option>
                    ))}
                  </select>
                  <button onClick={() => {
                    if (!matrixMid) return;
                    const codes = Object.keys(matrixMid).filter(c => c !== "00000" && c.startsWith(String(ezFilterPref).padStart(2, "0")));
                    setEconZoneCodes(prev => { const n = new Set(prev); codes.forEach(c => n.add(c)); return n; });
                  }} className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-xs">県内すべて追加</button>
                  <button onClick={() => setEconZoneCodes(new Set())} className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-xs">全クリア</button>
                  <span className="text-muted-foreground ml-auto">選択中: <strong>{econZoneCodes.size}</strong></span>
                </div>
                {matrixMid && (
                  <div className="max-h-[200px] overflow-y-auto border rounded bg-white dark:bg-slate-900">
                    {Object.entries(matrixMid)
                      .filter(([c, e]) => c !== "00000" && e.pref_code === ezFilterPref)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([code, entry]) => (
                        <label key={code} className={`flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 ${econZoneCodes.has(code) ? "bg-emerald-50 dark:bg-emerald-950" : ""}`}>
                          <input type="checkbox" checked={econZoneCodes.has(code)} onChange={() => {
                            setEconZoneCodes(prev => { const n = new Set(prev); n.has(code) ? n.delete(code) : n.add(code); return n; });
                          }} className="accent-emerald-600" />
                          <span className="flex-1 truncate">{entry.area_name}</span>
                        </label>
                      ))
                    }
                  </div>
                )}
              </div>
            </details>
            {/* 経済圏の分析結果サマリー */}
            {econZoneResult && (
              <div className="rounded-lg border bg-white dark:bg-slate-900 p-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                <div><div className="text-xs text-muted-foreground">EBM</div><div className="text-lg font-black">{econZoneResult.ebm.toFixed(2)}</div></div>
                <div><div className="text-xs text-muted-foreground">外から稼ぐ割合</div><div className="text-lg font-black">{econZoneResult.basic_ratio.toFixed(1)}%</div></div>
                <div><div className="text-xs text-muted-foreground">基盤雇用</div><div className="text-lg font-black">{Math.round(econZoneResult.basic_employment).toLocaleString()}</div></div>
                <div><div className="text-xs text-muted-foreground">基盤産業数</div><div className="text-lg font-black">{econZoneResult.n_basic_industries}</div></div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* CI102 エリア総合診断 — 需要・供給・強み・将来性の統合サマリー */}
      <AreaDiagnosisPanel
        area={target}
        pref={pref}
        city={selectedCity}
        econZone={analysisMode === "econ_zone" && econZoneResult ? (() => {
          // 経済圏メンバーの人口・世帯を集約（municipalitiesデータから）
          let ezPop = 0, ezPop2020 = 0, ezHH = 0, ezRentedTotal = 0, ezRentedPrivate = 0, ezHTTotal = 0;
          const codes = Array.from(econZoneCodes);
          const muniMap = new Map((municipalities ?? []).map(m => [m.area_code, m]));
          for (const code of codes) {
            const m = muniMap.get(code);
            if (m?.census2025) {
              ezPop += m.census2025.population;
              ezPop2020 += m.census2025.population_2020;
              ezHH += m.census2025.households;
            }
            if (m?.housing_tenure) {
              ezHTTotal += m.housing_tenure.total;
              ezRentedTotal += Math.round(m.housing_tenure.total * m.housing_tenure.rented_pct / 100);
              ezRentedPrivate += Math.round(m.housing_tenure.total * m.housing_tenure.rented_private_pct / 100);
            }
          }
          const ezPopPct = ezPop2020 > 0 ? ((ezPop - ezPop2020) / ezPop2020) * 100 : 0;
          const ezHH2020 = ezPop2020 > 0 && ezPop > 0 ? Math.round(ezHH / (1 + ezPopPct / 100 * 0.5)) : 0;
          const ezHhPct = ezHH2020 > 0 ? ((ezHH - ezHH2020) / ezHH2020) * 100 : 0;
          return {
            ebm: econZoneResult.ebm,
            basic_ratio: econZoneResult.basic_ratio,
            basic_employment: econZoneResult.basic_employment,
            total_employment: econZoneResult.total_employment,
            n_basic_industries: econZoneResult.n_basic_industries,
            top_lq_industries: econZoneResult.top_lq_industries,
            ...(ezPop > 0 ? {
              population: ezPop,
              population_2020: ezPop2020,
              households: ezHH,
              pop_change_pct: ezPopPct,
              hh_change_pct: ezHhPct,
              rented_pct: ezHTTotal > 0 ? Math.round(ezRentedTotal / ezHTTotal * 1000) / 10 : undefined,
              rented_private_pct: ezHTTotal > 0 ? Math.round(ezRentedPrivate / ezHTTotal * 1000) / 10 : undefined,
            } : {}),
          };
        })() : null}
      />

      <div className="rounded-lg border-2 bg-gradient-to-br from-emerald-50 to-blue-50 p-4">
        <p className="text-xs text-slate-600">💡 最有力候補</p>
        <p className="text-2xl font-bold mt-1">
          <span className="mr-2">{best.icon}</span>{best.label}
        </p>
        <p className="text-sm mt-1">
          物件適格スコア <strong style={{ color: best.verdict_color }}>{best.totalScore.toFixed(0)}/100</strong>
          {" → "}
          <strong style={{ color: best.verdict_color }}>{best.verdict}</strong>
        </p>
      </div>

      {/* 人口モメンタム — 需要側の直近実測(2020→2025)。CI102スコア(供給側)と並置 */}
      {momentumC && (
        <PopulationMomentumCard area={target} c={momentumC} supplyScore={best.totalScore} />
      )}

      {/* 物件タイプ別カード */}
      <div className="space-y-4">
        {scores.map((s) => (
          <PropertyTypeCard key={s.type} score={s} />
        ))}
      </div>

      {/* 🤖 ML 地価予測 (マクロ説明力) */}
      <PricePredictionSection pref={pref} />

      {/* Proformerへの導線 */}
      <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 p-4">
        <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">次のステップ: 物件レベルの詳細分析</p>
        <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
          エリアの分析結果をもとに、Proformerで個別物件のDCF（割引キャッシュフロー）分析を行うことで、マクロ（エリア）×ミクロ（物件）の統合判断ができます。
        </p>
        <a href="https://app.proformer.ai" target="_blank" rel="noopener noreferrer" className="inline-block mt-2 rounded bg-emerald-600 text-white px-4 py-2 text-sm font-bold hover:bg-emerald-700 transition-colors">
          Proformerで物件分析を始める →
        </a>
      </div>

      {/* 🏢 DCF (Proformer) 統合 - マクロ×ミクロ */}
      <DcfSection macroScore={best.totalScore} macroPropertyType={best.label} />

      {/* AI 投資判断レポート (4層ガードレール対応) */}
      <div className="rounded-lg border-2 border-blue-300 bg-blue-50 p-4 space-y-3" data-print-block>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">🤖 AI 投資判断レポート</p>
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-600 text-white">AI 生成</span>
          </div>
          <div className="flex gap-2 no-print">
            {aiResult && (
              <button
                onClick={copyToClipboard}
                className="px-3 py-1.5 text-xs rounded-md bg-slate-600 text-white hover:bg-slate-700"
              >
                📋 コピー
              </button>
            )}
            <button
              onClick={exportPdf}
              className="px-3 py-1.5 text-xs rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
              title="ブラウザの『PDFとして保存』で出力"
            >
              📄 PDF出力
            </button>
            <button
              onClick={runAi}
              disabled={aiLoading}
              className="px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white disabled:bg-slate-300 hover:bg-blue-700"
            >
              {aiLoading ? "生成中..." : aiResult ? "再生成" : "AI レポート生成"}
            </button>
          </div>
        </div>

        {/* 重要な免責事項 - 常時表示 */}
        <div className="rounded border-l-4 border-amber-500 bg-amber-50 p-2 text-xs text-slate-800">
          <strong>⚠ 重要な免責事項</strong>:
          本レポートは <strong>Claude AI による自動分析</strong>であり、不動産投資の判断材料の1つに過ぎません。
          <strong>投資判断は必ずお客様の責任において</strong>、専門家の助言と複数情報源を参照の上で行ってください。
          本ツールは <strong>投資助言ではなく分析情報の提供のみ</strong>を目的としています（宅地建物取引業法・消費者契約法に配慮）。
          AI 出力には不正確・誤解を招く表現が含まれる可能性があり、営業現場での提示前に営業担当者による精査を強く推奨します。
        </div>

        {aiError && (
          <p className="text-xs text-rose-700 bg-rose-50 p-2 rounded">エラー: {aiError}</p>
        )}

        {/* Layer 3: 危険語句警告 */}
        {aiWarnings.length > 0 && (
          <details className="rounded border-2 border-rose-300 bg-rose-50 p-2 text-xs">
            <summary className="font-semibold text-rose-900 cursor-pointer">
              🚨 {aiWarnings.length}件の注意すべき表現を検出
              {aiWarnings.filter((w) => w.level === "high").length > 0 && (
                <span className="ml-2 text-rose-700">
                  (High: {aiWarnings.filter((w) => w.level === "high").length}件)
                </span>
              )}
            </summary>
            <div className="mt-2 space-y-1.5">
              {aiWarnings.map((w, i) => (
                <div key={i} className="rounded bg-white p-2 border border-rose-200">
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        w.level === "high" ? "px-1.5 py-0.5 rounded text-xs bg-rose-600 text-white" :
                        w.level === "medium" ? "px-1.5 py-0.5 rounded text-xs bg-amber-500 text-white" :
                        "px-1.5 py-0.5 rounded text-xs bg-slate-400 text-white"
                      }
                    >
                      {w.level.toUpperCase()}
                    </span>
                    <span className="font-semibold">{w.category}</span>
                    <span className="text-rose-700">「{w.pattern}」</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 ml-1">
                    文脈: ...{w.context}...
                  </p>
                </div>
              ))}
              <p className="text-xs text-slate-600 mt-2">
                ※ 断定的助言・過度な楽観/悲観・保証的表現等が検出されました。
                お客様への提示前にこれらの表現を見直して修正することを推奨します。
              </p>
            </div>
          </details>
        )}

        {aiResult ? (
          <>
            {/* AI 生成テキスト (編集可能) */}
            <div className="bg-white rounded border p-3">
              <div className="flex items-center justify-between mb-2 text-xs text-slate-500">
                <span>📝 編集可能 — 営業現場提示前にレビュー・修正してください</span>
                {aiEdited != null && (
                  <button
                    onClick={() => setAiEdited(null)}
                    className="text-blue-600 hover:underline"
                  >
                    元に戻す
                  </button>
                )}
              </div>
              <textarea
                value={aiEdited ?? aiResult}
                onChange={(e) => setAiEdited(e.target.value)}
                className="w-full text-xs leading-relaxed font-mono p-2 border rounded resize-y"
                style={{ minHeight: "300px" }}
                aria-label="AI 生成レポート（編集可能）"
              />
            </div>

            {/* メタ情報 */}
            {aiMeta && (
              <div className="text-xs text-slate-500 flex flex-wrap gap-3">
                <span>モデル: {aiMeta.model}</span>
                <span>生成: {new Date(aiMeta.generated_at).toLocaleString()}</span>
                <span>応答: {(aiMeta.latency_ms / 1000).toFixed(1)}秒</span>
                <span>Temperature: {aiMeta.temperature}</span>
                {aiMeta.warnings_count > 0 && (
                  <span className="text-rose-700">⚠ 警告: {aiMeta.warnings_count}件</span>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-slate-600">
            ボタンを押すと、{target} のスコア結果から CCIM CI102 アナリスト視点の参考分析レポートを生成します。
            EBM・基盤雇用比率の正しい解釈、What-If と実績の区別、通勤歪みの注釈、データ出典の明示を含む。
            <br />
            <strong>適用ガードレール</strong>: 断定的助言禁止 / 過度な楽観・悲観禁止 / 元データ捏造禁止 /
            CI102 教科書整合性 / temperature=0.3 制御 / 出力危険語句自動検出。
          </p>
        )}
      </div>

      {/* お客様向け説明テンプレート */}
      <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 p-4" data-print-block>
        <p className="text-sm font-semibold mb-2">📝 お客様向け説明テンプレート（自動生成・ルールベース）</p>
        <div className="text-sm space-y-2 leading-relaxed">
          <p>
            『{target}』 の市場分析結果を統合的にご報告します。<strong>{best.label}</strong>が最も投資適格性が高く、
            物件適格スコア <strong style={{ color: best.verdict_color }}>{best.totalScore.toFixed(0)}点</strong>で<strong>{best.verdict}</strong>と判断されます。
          </p>
          <p>
            <strong>根拠</strong>:
            {best.rationale.length > 0 ? best.rationale.map((r) => r.replace("✓ ", "")).join(" / ") : "総合指標から判断"}
          </p>
          {best.risks.length > 0 && (
            <p className="text-amber-700">
              <strong>留意点</strong>:
              {best.risks.map((r) => r.replace("✗ ", "").replace("⚠ ", "")).join(" / ")}
            </p>
          )}
          <p className="text-xs text-slate-500 mt-2">
            ※ CCIM CI102 教科書の経済基盤分析（LQ/EBM/PER）・シフトシェア分析・小売ギャップ分析と、
            国土数値情報の空間データを統合した評価です。
          </p>
        </div>
      </div>

      {/* タブ間連携の案内 (PDF出力では不要) */}
      <details className="rounded-lg border p-3 text-sm no-print">
        <summary className="cursor-pointer font-semibold">🔗 各スコア要素の詳細はどのタブで見れますか？</summary>
        <table className="w-full text-xs mt-2">
          <thead>
            <tr className="border-b text-left">
              <th className="py-1">スコア要素</th>
              <th className="py-1">参照タブ</th>
              <th className="py-1">用途</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b"><td>経済基盤 (EBM)</td><td>② EBM・PER・予測</td><td>需要予測カスケード</td></tr>
            <tr className="border-b"><td>LQ・基盤産業</td><td>① LQ・経済基盤</td><td>特化産業の特定</td></tr>
            <tr className="border-b"><td>競争力 (RS)</td><td>③ シフトシェア</td><td>業種別の成長要因</td></tr>
            <tr className="border-b"><td>商業需要 (Gap)</td><td>④ 小売ギャップ</td><td>セクター別の出店機会</td></tr>
            <tr className="border-b"><td>地価・取引価格</td><td>⑤ 不動産取引価格</td><td>収益還元の前提</td></tr>
            <tr className="border-b"><td>NLNI 空間データ</td><td>⑥ 地図分析</td><td>洪水/用途/DID/立地適正</td></tr>
            <tr className="border-b"><td>分散度 (HHI等)</td><td>⑧ 都市圏(MSA)</td><td>多角化・リスク分散</td></tr>
            <tr className="border-b"><td>独自経済圏</td><td>⑨ カスタム経済圏</td><td>近隣自治体合算</td></tr>
            <tr><td>物件位置周辺</td><td>⑩ 商圏分析</td><td>住所→半径X km の経済集計</td></tr>
          </tbody>
        </table>
      </details>
    </div>
  );
}

/** ファクターのソース名 → 深掘りタブへのマッピング */
const SOURCE_TO_TAB: Record<string, { tab: string; label: string }> = {
  "EBM/基盤雇用比率": { tab: "ebm", label: "📐 需要予測で深掘り" },
  "EBM": { tab: "ebm", label: "📐 需要予測で深掘り" },
  "国勢2025実測+社人研推計": { tab: "demographics", label: "👥 人口動態で深掘り" },
  "人口動態": { tab: "demographics", label: "👥 人口動態で深掘り" },
  "NLNI洪水": { tab: "risk", label: "⚠️ 災害リスクで深掘り" },
  "洪水リスク": { tab: "risk", label: "⚠️ 災害リスクで深掘り" },
  "NLNI鉄道+バス": { tab: "access", label: "🚃 交通アクセスで深掘り" },
  "交通アクセス": { tab: "access", label: "🚃 交通アクセスで深掘り" },
  "NLNI立地適正化": { tab: "map", label: "🗺️ 地図で深掘り" },
  "立地適正化": { tab: "map", label: "🗺️ 地図で深掘り" },
  "小売ギャップ": { tab: "gap", label: "🛒 小売市場で深掘り" },
  "LQ小売業": { tab: "lq", label: "🏭 経済基盤で深掘り" },
  "LQオフィス系": { tab: "lq", label: "🏭 経済基盤で深掘り" },
  "LQ製造・物流": { tab: "lq", label: "🏭 経済基盤で深掘り" },
  "LQ医療福祉": { tab: "lq", label: "🏭 経済基盤で深掘り" },
  "シフトシェアRS": { tab: "shift", label: "📊 競争力で深掘り" },
  "RS/成長性": { tab: "shift", label: "📊 競争力で深掘り" },
  "MLIT地価": { tab: "realestate", label: "🏠 不動産取引で深掘り" },
  "NLNI地価公示": { tab: "realestate", label: "🏠 不動産取引で深掘り" },
};

function PropertyTypeCard({ score }: { score: PropertyScore }) {
  return (
    <div className="rounded-lg border-2 p-4 property-card" data-print-block style={{ borderColor: score.verdict_color + "60" }}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div>
          <span className="text-2xl mr-2">{score.icon}</span>
          <span className="font-bold">{score.label}</span>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold" style={{ color: score.verdict_color }}>
            {score.totalScore.toFixed(0)}
            <span className="text-xs text-slate-400 ml-1">/ 100</span>
          </div>
          <div className="text-sm font-semibold" style={{ color: score.verdict_color }}>
            {score.verdict}
          </div>
        </div>
      </div>

      {/* 因子分解 */}
      <div className="space-y-1.5">
        {score.factors.map((f) => (
          <div key={f.label} className="text-xs">
            <div className="flex items-center gap-2">
              <span className="w-24 shrink-0 truncate" title={f.label}>{f.label}</span>
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, f.score)}%`,
                    backgroundColor:
                      f.score >= 70 ? "#2A9D8F" :
                      f.score >= 50 ? "#D4A843" : "#E76F51",
                  }}
                />
              </div>
              <span className="w-12 shrink-0 text-right">{f.score.toFixed(0)}点</span>
              <span className="w-12 shrink-0 text-right text-slate-400">×{(f.weight * 100).toFixed(0)}%</span>
            </div>
            <div className="ml-26 text-xs text-slate-500 pl-26" style={{ paddingLeft: "104px" }}>
              {f.interpretation}
              {(() => {
                const link = SOURCE_TO_TAB[f.source];
                return link ? (
                  <a href={`?tab=${link.tab}`} className="ml-1 text-blue-600 hover:underline">{link.label} →</a>
                ) : (
                  <span className="text-slate-400 ml-1">({f.source})</span>
                );
              })()}
            </div>
          </div>
        ))}
      </div>

      {/* 根拠とリスク */}
      {(score.rationale.length > 0 || score.risks.length > 0) && (
        <div className="mt-3 grid md:grid-cols-2 gap-2 text-xs">
          {score.rationale.length > 0 && (
            <div className="rounded bg-emerald-50 border border-emerald-200 p-2">
              <p className="font-semibold text-emerald-900 mb-1">プラス要因</p>
              {score.rationale.map((r, i) => <p key={i}>{r}</p>)}
            </div>
          )}
          {score.risks.length > 0 && (
            <div className="rounded bg-rose-50 border border-rose-200 p-2">
              <p className="font-semibold text-rose-900 mb-1">マイナス要因</p>
              {score.risks.map((r, i) => <p key={i}>{r}</p>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
