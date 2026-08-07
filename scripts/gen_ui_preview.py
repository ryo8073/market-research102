"""意思決定支援版UIプレビュー: 需要(人口モメンタム)×供給(CI102スコア)で購入スタンスを提示。"""
import io,sys,json
from pathlib import Path
if sys.platform=="win32":
    sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding="utf-8",errors="replace")
base=Path("ci102-nextjs/public/data")
prefs=json.load(open(base/"prefectures.json",encoding="utf-8"))
def muni(pref,starts):
    arr=json.load(open(base/"municipalities"/f"{pref}.json",encoding="utf-8"))
    lst=arr if isinstance(arr,list) else list(arr.values())[0]
    return next((x for x in lst if (x.get("area_name") or "").startswith(starts)),None)
# name, census2025, 供給スコア(例示: 実UIではdecision-hubの総合スコアを渡す)
picks=[
 ("東京都", prefs["13"]["census2025"], round(prefs["13"]["suitability_score"]["total_score"])),
 ("福岡市", muni(40,"福岡市")["census2025"], 72),
 ("那覇市", muni(47,"那覇")["census2025"], 55),
 ("秋田市", muni(5,"秋田市")["census2025"], 41),
]
CLS={
 "growth":("成長","#16A34A","📈"),"resilient":("維持","#0D9488","🛡️"),
 "outperform_decline":("緩やか縮小","#CA8A04","⚖️"),"decline":("減少","#EA580C","⚠️"),
 "severe_decline":("深刻な減少","#E11D48","⛔"),
}
def pct(v): return f"{'+' if v>0 else ''}{v:.1f}%"
def tone(v): return "#16A34A" if v>=0 else "#DC2626"
def arr(v): return "▲" if v>=0 else "▼"
SLO,SHI=-10,5
def spos(v): return (min(SHI,max(SLO,v))-SLO)/(SHI-SLO)*100
# 需要×供給マトリクス座標
def mx(supply): return min(100,max(0,supply))         # x: 供給スコア 0-100
GLO,GHI=-6,6
def my(gap):    return 100-(min(GHI,max(GLO,gap))-GLO)/(GHI-GLO)*100  # y: 需要=全国比gap (上=強)

def stance(cls,gap,supply):
    if cls=="severe_decline":
        return ("取得は原則見送り","#E11D48","需要が構造的に縮小。中心部の希少立地か、医療・介護等ディフェンシブ用途に限定。")
    demand_up = cls in ("growth","resilient") or gap>=0
    supply_ok = supply>=55
    if demand_up and supply_ok:
        return ("積極取得を検討","#16A34A","需要（人口）と供給（雇用基盤）がともに良好。開発・取得の順張り候補。価格と利回りが見合えば主力対象。")
    if demand_up and not supply_ok:
        return ("選別取得（需要先行）","#0D9488","需要は追い風だが雇用基盤は弱め。基盤産業の中身とテナント信用力を精査し、駅近・DID内に絞って取得。")
    if (not demand_up) and supply_ok:
        return ("条件付取得（出口前提）","#CA8A04","雇用基盤は堅いが需要は逆風。保有期間と出口(売却)戦略を先に設計し、高稼働物件に限定。")
    return ("取得は慎重・原則見送り","#E11D48","需要・供給とも弱い。新規取得は見送り、既存保有は用途転換・早期出口を検討。")

def loc_hint(cls):
    if cls in ("growth","resilient"):
        return "市内では 駅近・DID中心部・居住誘導区域 を優先。地価上昇の初期なら開発余地も検討可。"
    if cls in ("outperform_decline","decline"):
        return "需要が残るのは DID中心部・生活利便が集積するエリア。郊外・立地適正化計画の区域外は回避。"
    return "取得するなら 中心部の希少立地 か 医療・介護等の需要が底堅い用途 に限定。"

def card(name,c,supply):
    label,color,emoji=CLS[c["momentum_class"]]
    gap=c["momentum_gap"]; above=gap>=0
    st_label,st_color,st_text=stance(c["momentum_class"],gap,supply)
    short=name.replace("市","").replace("都","")
    div=None
    if c["pop_change_pct"]<0 and c["hh_change_pct"]>0:
        div=f'人口減でも世帯は {pct(c["hh_change_pct"])} 増 → 単身・小世帯化。<b>賃貸・ワンルーム系の需要は底堅い</b>可能性。'
    elif c["pop_change_pct"]>0 and c["hh_change_pct"]>c["pop_change_pct"]+2:
        div=f'世帯が人口以上（{pct(c["hh_change_pct"])}）に増加 → <b>ファミリー〜単身まで住宅需要の裾野が広い</b>。'
    dn=int(c["population"]-c["population_2020"])
    x=mx(supply); y=my(gap)
    return f'''<div class="card" style="border-top-color:{st_color}">
      <div class="chead"><div class="ctitle">
        <div><div class="t1">🧭 立地・購入判断サポート <span class="muted">— {name}</span></div>
        <div class="t2">需要（人口モメンタム 2020→2025 実測）×供給（CI102経済スコア）で「買うべきか」を可視化</div></div></div>
        <div class="badge" style="background:{color}">需要: {emoji} {label} {pct(c['pop_change_pct'])}</div></div>

      <div class="stance" style="background:{st_color}12;border-left:5px solid {st_color}">
        <div class="stl">購入スタンス</div>
        <div class="stv" style="color:{st_color}">{st_label}</div>
        <div class="stt">{st_text}</div>
      </div>

      <div class="body">
        <div class="matrixwrap">
          <div class="mxtitle">需要 × 供給 判断マトリクス</div>
          <div class="matrix">
            <div class="q q11"></div><div class="q q12"></div><div class="q q21"></div><div class="q q22"></div>
            <div class="qlbl l11">取得回避</div><div class="qlbl l12">出口前提で条件付</div>
            <div class="qlbl l21">需要先行・供給精査</div><div class="qlbl l22">積極取得</div>
            <div class="midh"></div><div class="midv"></div>
            <div class="dot" style="left:{x:.1f}%;top:{y:.1f}%;background:{st_color}"><span>{short}</span></div>
            <div class="axx">供給スコア（雇用基盤）→</div>
            <div class="axy">需要（全国比）↑</div>
          </div>
          <div class="mxnote">縦=需要が全国平均より強い/弱い　横=供給(CI102経済スコア {supply}/100)</div>
        </div>

        <div class="right">
          <div class="tile big"><div class="tl">人口 (2025)</div><div class="tv">{c['population']:,}</div><div class="td" style="color:{tone(c['pop_change_pct'])}">{arr(c['pop_change_pct'])} {pct(c['pop_change_pct'])}（{dn:,}人）</div></div>
          <div class="tile"><div class="tl">世帯 (2025)</div><div class="tv2">{c['households']:,}</div><div class="td" style="color:{tone(c['hh_change_pct'])}">{arr(c['hh_change_pct'])} {pct(c['hh_change_pct'])}</div></div>
          <div class="tile"><div class="tl">人口密度</div><div class="tv2">{c['density']:,}</div><div class="td muted">人/km²</div></div>
          <div class="scalebox">
            <div class="scale"><div class="natline" style="left:{spos(c['national_pop_change_pct']):.1f}%"></div><div class="pin" style="left:{spos(c['pop_change_pct']):.1f}%;background:{color}"></div></div>
            <div class="scl"><span>需要 全国比</span><b style="color:{'#16A34A' if above else '#DC2626'}">{'+' if above else ''}{gap:.1f}pt {'上回る' if above else '下回る'}</b></div>
          </div>
        </div>
      </div>

      {f'<div class="divg">💡 {div}</div>' if div else ''}

      <div class="hint"><span class="hk">📍 立地選定のヒント</span>{loc_hint(c['momentum_class'])}</div>

      <div class="next"><span class="hk">✓ 次のアクション</span>
        <span class="step">① 供給の中身を確認（経済基盤タブ: EBM・基盤産業）</span>
        <span class="step">② 価格・利回り（不動産タブ）</span>
        <span class="step">③ リスク（洪水・アクセス）</span>
        <span class="step">④ DCFで最終判断（Proformer連携）</span>
      </div>

      <div class="foot">出典: {c['source']}　│　需要=直近実測（本指標）× 供給=CI102経済分析(2021)。両輪で購入可否を判断します。</div>
    </div>'''

html=f'''<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>立地・購入判断サポート プレビュー</title><style>
*{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:'Yu Gothic','Hiragino Kaku Gothic ProN','Noto Sans JP',system-ui,sans-serif;background:#EEF1F5;padding:28px;color:#0F172A}}
h0{{display:block;max-width:900px;margin:0 auto 8px;font-size:13px;color:#64748B;font-weight:700}}
.grid{{display:flex;flex-direction:column;gap:22px;max-width:900px;margin:0 auto}}
.card{{background:#fff;border-radius:18px;border-top:4px solid;padding:22px 24px;box-shadow:0 6px 24px rgba(15,23,42,.08),0 1px 3px rgba(15,23,42,.06)}}
.chead{{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px}}
.t1{{font-size:16px;font-weight:800}}.t1 .muted{{font-weight:600;color:#64748B}}
.t2{{font-size:11px;color:#94A3B8;margin-top:2px;max-width:560px}}
.badge{{color:#fff;font-weight:800;font-size:12px;padding:7px 13px;border-radius:999px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.15)}}
.stance{{border-radius:12px;padding:12px 16px;margin-bottom:16px}}
.stl{{font-size:10px;font-weight:700;color:#64748B;letter-spacing:.08em}}
.stv{{font-size:22px;font-weight:900;margin:1px 0 3px}}
.stt{{font-size:12.5px;line-height:1.55;color:#1E293B}}
.body{{display:flex;gap:22px;align-items:flex-start}}
.matrixwrap{{flex:none;width:270px}}
.mxtitle{{font-size:11px;font-weight:800;color:#334155;margin-bottom:6px;text-align:center}}
.matrix{{position:relative;width:250px;height:250px;margin:0 auto;border:1px solid #E2E8F0;border-radius:10px;overflow:hidden}}
.q{{position:absolute;width:50%;height:50%}}
.q11{{left:0;top:0;background:#EF444410}}.q12{{right:0;top:0;background:#F59E0B10}}
.q21{{left:0;bottom:0;background:#0D948810}}.q22{{right:0;bottom:0;background:#16A34A14}}
.qlbl{{position:absolute;font-size:9.5px;font-weight:700;color:#64748B;padding:4px 6px;white-space:nowrap}}
.l11{{left:6px;top:5px;color:#DC2626}}.l12{{right:6px;top:5px;color:#D97706}}
.l21{{left:6px;bottom:5px;color:#0D9488}}.l22{{right:6px;bottom:5px;color:#16A34A}}
.midh{{position:absolute;left:0;right:0;top:50%;height:1px;background:#CBD5E1}}
.midv{{position:absolute;top:0;bottom:0;left:50%;width:1px;background:#CBD5E1}}
.dot{{position:absolute;width:15px;height:15px;border-radius:50%;border:3px solid #fff;transform:translate(-50%,-50%);box-shadow:0 2px 6px rgba(0,0,0,.4);z-index:3}}
.dot span{{position:absolute;left:18px;top:-2px;font-size:11px;font-weight:800;color:#0F172A;white-space:nowrap;background:rgba(255,255,255,.85);padding:0 3px;border-radius:3px}}
.axx{{position:absolute;bottom:3px;left:50%;transform:translateX(-50%);font-size:8.5px;color:#94A3B8;font-weight:600}}
.axy{{position:absolute;top:50%;left:3px;transform:translateY(-50%) rotate(-90deg);transform-origin:left center;font-size:8.5px;color:#94A3B8;font-weight:600}}
.mxnote{{font-size:9px;color:#94A3B8;text-align:center;margin-top:6px}}
.right{{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:10px;align-content:start}}
.tile{{background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:10px 12px;text-align:center}}
.tile.big{{grid-column:1 / span 2}}
.tl{{font-size:10px;color:#64748B;font-weight:600}}
.tv{{font-size:20px;font-weight:800;margin-top:2px}}.tv2{{font-size:17px;font-weight:800;margin-top:2px}}
.td{{font-size:12px;font-weight:800;margin-top:1px}}.muted{{color:#94A3B8}}
.scalebox{{grid-column:1 / span 2;margin-top:2px}}
.scale{{position:relative;height:12px;border-radius:6px;background:linear-gradient(90deg,#EF4444,#F59E0B 33%,#FDE047 55%,#86EFAC 73%,#16A34A)}}
.natline{{position:absolute;top:-4px;bottom:-4px;width:2px;background:#0F172A;transform:translateX(-1px)}}
.pin{{position:absolute;top:50%;width:13px;height:13px;border-radius:50%;border:2px solid #fff;transform:translate(-50%,-50%);box-shadow:0 1px 4px rgba(0,0,0,.35)}}
.scl{{display:flex;justify-content:space-between;font-size:10px;color:#64748B;margin-top:5px;font-weight:600}}
.divg{{margin-top:14px;font-size:12px;line-height:1.5;color:#475569;background:#F1F5F9;border-radius:10px;padding:9px 12px}}
.hint,.next{{margin-top:12px;font-size:12px;line-height:1.55;color:#334155}}
.hk{{display:inline-block;font-weight:800;color:#1B2A4A;margin-right:8px}}
.next{{display:flex;flex-wrap:wrap;gap:6px;align-items:center}}
.step{{background:#EEF2FF;color:#3730A3;border-radius:999px;padding:3px 10px;font-size:11px;font-weight:700}}
.foot{{font-size:10px;color:#94A3B8;margin-top:14px;border-top:1px solid #F1F5F9;padding-top:9px}}
</style></head><body>
<h0>UIプレビュー（意思決定支援版）— 立地・購入判断サポート／令和7年国勢調査 実データ</h0>
<div class="grid">{''.join(card(n,c,s) for n,c,s in picks)}</div>
</body></html>'''
out=Path("ci102-nextjs/public/ui-preview-momentum.html")
out.write_text(html,encoding="utf-8")
print("wrote",out,len(html),"bytes;",len(picks),"cards")
