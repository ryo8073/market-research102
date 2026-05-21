"use client";

import { useMemo, useState } from "react";
import PlotlyChart from "@/components/plotly-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  lq_table, total_basic_employment, economic_base_multiplier,
  population_employment_ratio, forecast_total_employment_change,
  forecast_population_change, forecast_housing_units,
  forecast_required_floor_area, forecast_building_count,
  development_feasibility,
} from "@/lib/calculator";

interface Props {
  localEmp: Record<string, number>;
  nationalEmp: Record<string, number>;
  population: number;
  totalEmployment: number;
  personsPerHousehold: number;
}

export default function EbmTab({ localEmp, nationalEmp, population, totalEmployment, personsPerHousehold }: Props) {
  const [newBasicJobs, setNewBasicJobs] = useState(100);
  const [avgUnitSize, setAvgUnitSize] = useState(65);
  const [floorsPerBldg, setFloorsPerBldg] = useState(5);
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
      {/* EBM/PER KPIs */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">EBM</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{ebm.toFixed(2)}</div><p className="text-xs text-muted-foreground">基盤雇用1人が支える総雇用</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">PER</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{per.toFixed(2)}</div><p className="text-xs text-muted-foreground">就業者1人あたり総人口</p></CardContent>
        </Card>
      </div>

      {/* Simulation Input */}
      <div className="rounded-lg border p-4">
        <h3 className="font-semibold mb-3">シミュレーション（What-If）</h3>
        <p className="text-xs text-muted-foreground mb-3">基盤雇用が変動した場合の波及効果。予測ではありません。</p>
        <label className="text-sm">新規基盤雇用</label>
        <input type="number" value={newBasicJobs} onChange={(e) => setNewBasicJobs(Number(e.target.value))}
          className="ml-2 rounded border px-3 py-1 w-28 text-sm" />
      </div>

      {/* Cascade Results */}
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{deltaTotal.toLocaleString(undefined, { signDisplay: "always", maximumFractionDigits: 0 })}</div><p className="text-xs text-muted-foreground">総雇用波及</p></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{deltaPop.toLocaleString(undefined, { signDisplay: "always", maximumFractionDigits: 0 })}</div><p className="text-xs text-muted-foreground">人口波及</p></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{deltaHousing.toLocaleString(undefined, { signDisplay: "always", maximumFractionDigits: 0 })} 戸</div><p className="text-xs text-muted-foreground">住宅需要</p></CardContent></Card>
      </div>

      {/* Waterfall Chart */}
      <PlotlyChart
        data={[{
          type: "waterfall" as any,
          orientation: "v",
          measure: ["absolute", "relative", "relative", "relative", "total", "total"],
          x: [`基盤雇用`, `×EBM ${ebm.toFixed(1)}`, `×PER ${per.toFixed(1)}`, `÷世帯人員`, "延床面積(m2)", "棟数"],
          y: [newBasicJobs, deltaTotal - newBasicJobs, deltaPop - deltaTotal, deltaHousing - deltaPop, floorArea, bldgCount],
          text: [`${newBasicJobs}人`, `${Math.round(deltaTotal)}人`, `${Math.round(deltaPop)}人`, `${Math.round(deltaHousing)}戸`, `${Math.round(floorArea)}m2`, `${bldgCount.toFixed(1)}棟`],
          textposition: "outside",
          connector: { line: { color: "#6B7280" } },
          increasing: { marker: { color: "#2A9D8F" } },
          decreasing: { marker: { color: "#E76F51" } },
          totals: { marker: { color: "#1B2A4A" } },
        } as any]}
        layout={{ title: { text: "EBM/PER カスケード → 不動産開発規模" }, height: 450, showlegend: false }}
      />

      {/* Feasibility */}
      <h3 className="text-lg font-semibold">開発フィジビリティ</h3>
      <div className="grid grid-cols-2 gap-6">
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
    </div>
  );
}
