"""既存 Next.js 本番JSON に2025国勢調査 人口モメンタムを差分反映する。

全再生成(precompute_json.py: 30-60分+NLNI依存)を回避し、既存JSONの
NLNI由来フィールド(地価/駅/洪水等)を保持したまま人口系のみ更新する。
"""
from __future__ import annotations
import io, sys, json
from pathlib import Path
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

PROJ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJ))
from data.census_cache import load_cached_dataset, DS_POPULATION, get_area_population_momentum
from scorecard import classify_population_momentum
from calculator import population_employment_ratio, estimate_daytime_population

CACHE = PROJ / "data" / "cache"
NEXT_DATA = PROJ / "ci102-nextjs" / "public" / "data"
df = load_cached_dataset(CACHE, DS_POPULATION.csv_name)
assert df is not None, "2025人口キャッシュが見つかりません"
_nat = get_area_population_momentum(df, "00000")
NAT = round(float(_nat.get("pop_change_pct", -2.45)), 2)
print(f"全国 人口増減率(2020->2025) = {NAT}%")

def block(area_code: str):
    m = get_area_population_momentum(df, area_code)
    if not m or "population" not in m:
        return None
    pc = round(float(m.get("pop_change_pct", 0.0)), 2)
    return {
        "population": int(m.get("population", 0)),
        "population_2020": int(m.get("population_2020", 0)),
        "households": int(m.get("households", 0)),
        "pop_change_pct": pc,
        "hh_change_pct": round(float(m.get("hh_change_pct", 0.0)), 2),
        "national_pop_change_pct": NAT,
        "momentum_gap": round(pc - NAT, 2),
        "momentum_class": classify_population_momentum(pc, NAT),
        "density": round(float(m.get("density", 0.0)), 1),
        "source": "総務省 令和7年国勢調査 人口速報集計 (2026-05公表)",
    }

pref_path = NEXT_DATA / "prefectures.json"
prefs = json.load(open(pref_path, encoding="utf-8"))
updated = 0; rows = []
for code_str, rec in prefs.items():
    code = int(code_str)
    b = block(f"{code:02d}000")
    if not b: continue
    rec["census2025"] = b
    pop = b["population"]; hh = b["households"]
    rec["population"] = pop; rec["households"] = hh
    total_emp = rec.get("total_employment", 0) or 0
    basic_emp = rec.get("basic_emp", 0) or 0
    if pop > 0:
        rec["persons_per_household"] = round(pop / hh, 2) if hh > 0 else rec.get("persons_per_household")
        rec["emp_to_pop_ratio"] = round(total_emp / pop, 3) if total_emp else rec.get("emp_to_pop_ratio")
    if total_emp > 0:
        rec["per"] = round(population_employment_ratio(pop, total_emp), 2)
    if pop > 0 and basic_emp > 0:
        rec["daytime_population"] = round(estimate_daytime_population(pop, basic_emp), 0)
    updated += 1
    rows.append((rec.get("pref_name", code_str), b["pop_change_pct"], b["momentum_class"]))
json.dump(prefs, open(pref_path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"prefectures.json: {updated}/{len(prefs)} updated")

muni_dir = NEXT_DATA / "municipalities"
mfiles = sorted(muni_dir.glob("*.json"), key=lambda p: int(p.stem))
m_total = m_hit = 0
for mp in mfiles:
    data = json.load(open(mp, encoding="utf-8"))
    recs = data if isinstance(data, list) else data.get("municipalities", data)
    if not isinstance(recs, list): continue
    for rec in recs:
        ac = rec.get("area_code")
        if not ac: continue
        m_total += 1
        b = block(str(ac))
        if b:
            rec["census2025"] = b; m_hit += 1
    json.dump(data, open(mp, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"municipalities: {m_hit}/{m_total} recs enriched ({len(mfiles)} files)")

rows.sort(key=lambda r: r[1], reverse=True)
print("\n=== 人口増加TOP5 (2020->2025) ===")
for name, pc, cls in rows[:5]: print(f"  {name}: {pc:+.1f}% [{cls}]")
print("=== 人口減少ワースト5 ===")
for name, pc, cls in rows[-5:]: print(f"  {name}: {pc:+.1f}% [{cls}]")
print("DONE")
