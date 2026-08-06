import io,sys,json
from pathlib import Path
if sys.platform=="win32":
    sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding="utf-8",errors="replace")
d=json.load(open("ci102-nextjs/public/data/prefectures.json",encoding="utf-8"))
DCLASS={"growth":85,"resilient":70,"outperform_decline":55,"decline":38,"severe_decline":20}
def rating(s):
    if s>=75: return ("強い","#16A34A")
    if s>=60: return ("やや強い","#0D9488")
    if s>=45: return ("中立","#CA8A04")
    if s>=30: return ("やや弱い","#EA580C")
    return ("弱い","#E11D48")
def clamp(v,lo,hi): return max(lo,min(hi,v))
def pct(v): return f"{'+' if v>0 else ''}{v:.1f}%"
def num(v): return f"{'+' if v>0 else ''}{round(v):,}"
def stance(o,dm,sp):
    if o>=70: return ("積極取得を検討","#16A34A","需要・供給・将来性が揃う優良市場。価格と利回りが見合えば主力対象。")
    if o>=55:
        return ("選別取得（需要先行）","#0D9488","需要は追い風。供給(雇用基盤)の中身を精査し、立地を絞って取得。") if dm>=sp else ("条件付取得（出口前提）","#CA8A04","供給は堅いが需要は伸び悩み。出口戦略を設計のうえ高稼働物件に限定。")
    if o>=40: return ("様子見・厳選","#EA580C","強みは局所的。中心部の希少立地・底堅い用途に限定して検討。")
    return ("取得は原則見送り","#E11D48","需要・供給とも弱い。新規取得は見送り、保有資産は早期出口・用途転換を検討。")
def analyze(r):
    c=r["census2025"];ss=r.get("shift_share_table",[])
    ssx=sorted(ss,key=lambda x:x.get("regional_shift",0),reverse=True)
    rs_win=[i for i in ssx if i.get("regional_shift",0)>0][:3]
    lq=[i for i in r.get("top_lq_industries",[]) if i.get("lq",0)>1][:3]
    su=r.get("suitability_score",{});gap=c["momentum_gap"];cls=c["momentum_class"]
    agg=r.get("aggregate_gap_factor",0);leak=r.get("num_leakage_sectors",0);rs=r.get("rs_total",0)
    total=r.get("total_employment",0)
    ebm_mid=r.get("ebm_mid",r.get("ebm",0));basic_mid=round(r.get("basic_emp_mid",r.get("basic_emp",0)));bratio_mid=r.get("basic_ratio_mid",r.get("basic_ratio",0))
    base_ind=(r.get("top_lq_industries_mid") or r.get("top_lq_industries") or [])[:5]
    pop=c["population"];per_local=pop/total if total>0 else r.get("per",0)
    pp=r.get("pop_projection",{});p25=pp.get("2025",pop);p35=pp.get("2035")
    pph=r.get("persons_per_household",0)
    fd=None
    if p35 and pph>0:
        dpop=p35-p25;dhh=round(p35/pph-p25/pph);fd=dict(dPop=round(dpop),dHH=dhh,dPct=dpop/p25*100)
    dpct=fd["dPct"] if fd else None
    rs_share=(rs/total*100) if total>0 else 0
    demand=min(100,DCLASS.get(cls,40)+min(10,leak*3)+(5 if agg>10 else 0))
    supply=round(0.45*su.get("ratio_score",0)+0.25*su.get("ebm_score",0)+0.30*su.get("scale_score",0))
    future=50+clamp(gap*4,-24,24)+clamp(rs_share*8,-12,12)+(clamp(dpct*1.2,-18,12) if dpct is not None else 0)
    future=round(clamp(future,0,100));overall=round(0.4*demand+0.3*supply+0.3*future)
    return dict(c=c,su=su,gap=gap,cls=cls,agg=agg,dpct=dpct,demand=demand,supply=supply,future=future,
                overall=overall,rs=rs,rs_share=rs_share,lq=lq,rs_win=rs_win,total=total,ebm_mid=ebm_mid,
                basic_mid=basic_mid,bratio_mid=bratio_mid,base_ind=base_ind,pop=pop,per_local=per_local,
                pph=pph,fd=fd,r=r)
def chip(l,s):
    lab,col=rating(s)
    return f'<div class="chip"><div class="cl">{l}</div><div class="cv" style="color:{col}">{lab}</div><div class="cs">{s}<span>/100</span></div><div class="bar"><i style="width:{s}%;background:{col}"></i></div></div>'
def sect(icon,title,score,body):
    lab,col=rating(score)
    return f'<div class="sect"><div class="sh"><span class="si">{icon}</span><span class="stt">{title}</span><span class="sr" style="background:{col}">{lab} {score}</span></div><div class="sb">{body}</div></div>'
def panel(name,r):
    a=analyze(r);c=a["c"];su=a["su"];st_lab,st_col,st_txt=stance(a["overall"],a["demand"],a["supply"])
    lqn="、".join(f'{i["industry"]}(LQ {i["lq"]:.2f})' for i in a["lq"]) or "際立った特化産業なし"
    rsn="、".join(f'{i["industry"]}(RS {num(i["regional_shift"])})' for i in a["rs_win"]) or "競争優位産業なし"
    proj=f'{pct(a["dpct"])}（2025→2035推計）' if a["dpct"] is not None else "—"
    dt=(f'人口モメンタム {pct(c["pop_change_pct"])}（全国比 {a["gap"]:+.1f}pt・都道府県実測）／世帯 {pct(c["hh_change_pct"])}。長期人口は {proj}。'
        f'小売需給ギャップ {a["agg"]:+.1f}（{"購買力の域外流出＝出店余地" if a["agg"]>5 else "供給過多ぎみ" if a["agg"]<-5 else "ほぼ均衡"}）。PER {a["per_local"]:.2f}。')
    ebm=a["ebm_mid"];bratio=a["bratio_mid"]
    sut=(f'経済基盤（{name}・中分類）: 基盤雇用 {a["basic_mid"]:,} 人・基盤比率 {bratio:.1f}%、EBM {ebm:.1f}（基盤雇用1人が総雇用を約{ebm:.1f}人支える波及力）。'
         f'総雇用 {a["total"]:,} 人。{"EBMはCI102健全域(3〜6)。" if 3<=ebm<=6 else "EBMがやや高く基盤過小/通勤流入の可能性。" if ebm>6 else "EBMが低く基盤依存度が高い。"}{"輸出基盤に厚みあり。" if bratio>=12 else "輸出基盤はやや薄め。"}')
    strt=f'特化（域外を稼ぐ産業）: {lqn}。全国を上回る競争力で伸びる産業: {rsn}。市場規模スコア {su.get("scale_score",0):.0f}/100。'
    fut=(f'将来性は「直近需要(全国比 {a["gap"]:+.1f}pt)×競争力(RSが雇用の{a["rs_share"]:+.2f}%)×長期推計({proj})」で評価。'
         f'{"競争力は全国平均を上回り、基盤雇用の純増余地がある。" if a["rs"]>0 else "競争力は全国平均を下回り、構造的に劣後。"}')
    # calc flow
    lqex=a["base_ind"][:3];wi=1000;dEmp=ebm*wi;dPopWI=a["per_local"]*dEmp;dU=dPopWI/a["pph"] if a["pph"]>0 else 0
    steps=[
      ("① 特化係数 LQ（何で稼ぐ地域か）","LQ = (地域の産業別従業者比) ÷ (全国の産業別従業者比)",
       ("例: "+" / ".join(f'{i["industry"]} LQ {i["lq"]:.2f}' for i in lqex)) if lqex else "特化産業なし",
       "LQ&gt;1 = 全国平均より特化 = 域外に売って所得を稼ぐ『基盤』産業。"),
      ("② 基盤雇用 Basic Employment","基盤雇用 = Σ 各産業の超過雇用（LQ&gt;1分）= local_emp × (1 − 1/LQ)",
       f'基盤雇用 {a["basic_mid"]:,} 人 ／ 総雇用 {a["total"]:,} 人（基盤比率 {bratio:.1f}%）',"域外需要に支えられた雇用。地域経済のエンジン。"),
      ("③ 経済基盤乗数 EBM","EBM = 総雇用 ÷ 基盤雇用",f'EBM = {a["total"]:,} ÷ {a["basic_mid"]:,} = {ebm:.2f}',
       f'基盤雇用1人が地域全体で約{ebm:.1f}人の雇用を生む波及力。{"CI102健全域(3〜6)。" if 3<=ebm<=6 else "高め=基盤過小/通勤流入の可能性。" if ebm>6 else "低め=基盤依存度が高い。"}'),
      ("④ 人口・雇用比 PER","PER = 人口 ÷ 総雇用",f'PER = {a["pop"]:,} ÷ {a["total"]:,} = {a["per_local"]:.2f}',"雇用1人あたりの人口。雇用増が人口(需要)へ波及する係数。"),
      ("⑤ 予測カスケード（乗数の効き方）","Δ基盤雇用 →(×EBM) Δ総雇用 →(×PER) Δ人口 →(÷世帯人員) Δ住宅戸数",
       f'基盤+{wi:,}人 → 総雇用 +{round(dEmp):,} → 人口 +{round(dPopWI):,} → 住宅 +{round(dU):,} 戸',
       "新規の基盤雇用(工場誘致・本社移転等)が住宅需要へ波及する理論量。投資インパクトの試算に。"),
    ]
    steps_html="".join(f'<div class="step"><div class="sth"><span class="stn">{i+1}</span><span class="stt2">{t}</span></div><p class="fml">{fm}</p><p class="cal">{ca}</p><p class="stnote">{nt}</p></div>' for i,(t,fm,ca,nt) in enumerate(steps))
    # economic base bar
    total=a["total"];bpct=(a["basic_mid"]/total*100) if total>0 else bratio;nonb=max(0,total-a["basic_mid"])
    chips_html=("".join(f'<span class="ebchip">{i["industry"]} <em>LQ {i["lq"]:.2f}</em></span>' for i in a["base_ind"]) or '<span class="mut">LQ&gt;1の特化産業は乏しく、域外を稼ぐ基盤は限定的。</span>')
    # future demand cards
    fd=a["fd"];fd_html=""
    if fd:
        fl,fc=rating(a["supply"])
        fd_html=(f'<div class="fut"><div class="ebt2">🔮 将来需要予測 <span class="ebsub">— 社人研 2025→2035 推計（都道府県）を投資判断用の「戸数」に換算</span></div>'
          f'<div class="fcards">'
          f'<div class="fcard"><div class="fk">人口 (2025→2035)</div><div class="fv" style="color:{"#16A34A" if fd["dPop"]>=0 else "#DC2626"}">{pct(fd["dPct"])}</div><div class="fkk">{num(fd["dPop"])} 人</div></div>'
          f'<div class="fcard"><div class="fk">世帯増減 → 住宅純需要</div><div class="fv" style="color:{"#16A34A" if fd["dHH"]>=0 else "#DC2626"}">{num(fd["dHH"])} 戸</div><div class="fkk">世帯人員 {a["pph"]:.2f} 人で換算</div></div>'
          f'<div class="fcard"><div class="fk">供給の耐性（基盤）</div><div class="fv" style="color:{fc}">{fl}</div><div class="fkk">基盤比率 {bratio:.1f}% / RS {"上向き" if a["rs"]>0 else "下向き"}</div></div>'
          f'</div>'
          f'<p class="ebp">{("今後10年で世帯が約"+format(fd["dHH"],",")+"増える見込み。新規住宅の純需要が期待でき、"+("競争力ある基盤雇用が下支え。" if a["rs"]>0 else "ただし雇用競争力は弱く、立地選別が重要。")) if fd["dHH"]>=0 else ("今後10年で世帯が約"+format(abs(fd["dHH"]),",")+"減る見込み。新規供給より更新・建替・用途転換の需要が中心。"+("厚い輸出基盤が縮小を緩和。" if bratio>=12 else "輸出基盤が薄く、縮小が加速しやすい。"))} <span class="mut">※ 戸数は世帯純増減の目安（空室・建替除く）。</span></p></div>')
    # needs
    needs=[]
    if c["pop_change_pct"]<0 and c["hh_change_pct"]>0: needs.append(("🏠","単身・小世帯向け賃貸",f'世帯増({pct(c["hh_change_pct"])})×人口減 → 世帯分裂。ワンルーム/1LDKが底堅い'))
    if a["dpct"] is not None and a["dpct"]<-5: needs.append(("🏥","医療・介護・シニア住宅","長期人口が縮小 → 高齢化。ディフェンシブ用途に恒常需要"))
    if a["agg"]>10: needs.append(("🛒","商業（出店余地）",f'購買力が域外流出（漏損 +{a["agg"]:.1f}）→ 未充足の商業需要'))
    elif a["agg"]<-10: needs.append(("🏢","商業は差別化立地に限定",f'小売が供給過多（余剰 {a["agg"]:.1f}）→ 出店は競争激化'))
    if bratio>=12 and a["rs"]>0: needs.append(("💼","基盤就業者向け住宅",f'輸出基盤が厚く({bratio:.0f}%)競争力も上向き → 就業者の実需が安定'))
    needs_html=""
    if needs:
        items="".join(f'<div class="need"><span class="ni">{ic}</span><div><div class="nl">{l}</div><div class="nw">{w}</div></div></div>' for ic,l,w in needs[:5])
        needs_html=f'<div class="needs"><div class="ebt2">🎯 このエリアで狙うべきニーズ（用途別）<span class="ebsub">— {name} の需要構造から</span></div><div class="ngrid">{items}</div></div>'
    # strengths/risks
    strengths=[];risks=[]
    if a["cls"] in ("growth","resilient") or a["gap"]>=0: strengths.append(f'需要が全国平均を上回る（人口 {pct(c["pop_change_pct"])}・全国比 {a["gap"]:+.1f}pt）（国勢調査2025速報）')
    if c["pop_change_pct"]<0 and c["hh_change_pct"]>0: strengths.append(f'世帯増で賃貸・単身向け需要が底堅い（世帯 {pct(c["hh_change_pct"])}）（国勢調査2025速報）')
    for i in a["lq"]: strengths.append(f'{i["industry"]}に特化（LQ {i["lq"]:.2f}）＝域外から所得を稼ぐ基盤（経済センサス2021 / LQ）')
    for i in a["rs_win"][:2]: strengths.append(f'{i["industry"]}が全国を上回る競争力で伸長（RS {num(i["regional_shift"])}）（シフトシェア分析）')
    if fd and fd["dHH"]>0: strengths.append(f'長期で世帯純増 約{fd["dHH"]:,}（都道府県推計→住宅純需要の拡大）')
    if 3<=ebm<=6: strengths.append(f'EBM {ebm:.1f} はCI102健全域(3〜6)＝基盤と波及のバランス良好')
    if a["cls"] in ("decline","severe_decline"): risks.append(f'直近人口が減少（{pct(c["pop_change_pct"])}・全国比 {a["gap"]:+.1f}pt）（国勢調査2025速報）')
    if a["dpct"] is not None and a["dpct"]<-10: risks.append(f'長期人口が大きく縮小見込み（{pct(a["dpct"])} 2025→2035）（社人研推計）')
    if bratio<5: risks.append(f'輸出基盤が薄く域外需要ショックに弱い（基盤比率 {bratio:.1f}%）（EBM/基盤雇用）')
    if ebm>8: risks.append(f'EBMが高く基盤過小/通勤流入の可能性 → 経済圏での再評価を推奨（EBM {ebm:.1f}）')
    if a["agg"]<-10: risks.append(f'小売が供給過多＝新規出店は競争激化（余剰 {a["agg"]:.1f}）（小売ギャップ）')
    if a["rs"]<0: risks.append(f'競争力が全国平均を下回る（RS {num(a["rs"])}）（シフトシェア分析）')
    st_items="".join(f'<p>・{t}</p>' for t in strengths[:4]) or '<p class="mut">際立った強みは限定的。</p>'
    rk_items="".join(f'<p>・{t}</p>' for t in risks[:4]) or '<p class="mut">重大なリスクは検出されず。</p>'
    pop2020=c["population_2020"];popd=c["population"]-pop2020;hh2020=round(c["households"]/(1+(c.get("hh_change_pct",0))/100));hhd=c["households"]-hh2020
    cmp_html=(f'<div class="cmp"><div class="ebt2">🔁 データ更新の変化 <span class="ebsub">— 以前 2020 → 最新 2025（国勢調査 実測 / {name}）</span></div>'
      f'<div class="cgrid"><div class="ccard"><div class="fk">人口</div><div class="cval">{pop2020:,} → {c["population"]:,}</div>'
      f'<div class="cd" style="color:{"#16A34A" if c["pop_change_pct"]>=0 else "#DC2626"}">{num(popd)} 人（{pct(c["pop_change_pct"])}）／ 全国 {pct(c["national_pop_change_pct"])}・差 {a["gap"]:+.1f}pt</div></div>'
      f'<div class="ccard"><div class="fk">世帯</div><div class="cval">{hh2020:,} → {c["households"]:,}</div>'
      f'<div class="cd" style="color:{"#16A34A" if c["hh_change_pct"]>=0 else "#DC2626"}">{num(hhd)} 世帯（{pct(c["hh_change_pct"])}）{"／人口減でも世帯増=単身化" if c["pop_change_pct"]<0 and c["hh_change_pct"]>0 else ""}</div></div></div>'
      f'<p class="ebnote">※ 以前の分析は長期推計（2020→2040 {pct(r.get("pop_change_pct",0))}）が主指標。データ更新で直近5年の実測モメンタムを追加。</p></div>')
    sst=r.get("shift_share_table",[]) or []
    ssnat=sum(i.get("national_growth",0) for i in sst);ssmix=sum(i.get("industry_mix",0) for i in sst)
    ssact=r.get("actual_emp_change") or sum(i.get("actual_change",0) for i in sst)
    rsmid=r.get("rs_total_mid")
    rs_html=(f'<div class="cmp"><div class="ebt2">📊 雇用の変化とRS（競争力） <span class="ebsub">— 2016 → 2021 シフトシェア分解（経済センサス・都道府県）</span></div>'
      f'<p class="ebp">総雇用の実測変化 <b>{num(ssact)} 人</b> ＝ 全国トレンド {num(ssnat)} ＋ 産業構成 {num(ssmix)} ＋ <b>地域シフト（RS＝競争力） {num(a["rs"])}</b></p>'
      f'<div class="fcards"><div class="fcard"><div class="fk">RS 大分類17業種</div><div class="fv" style="color:{"#16A34A" if a["rs"]>=0 else "#DC2626"}">{num(a["rs"])} 人</div><div class="fkk">牽引: {r.get("top_rs_industry","—")}（{num(r.get("top_rs_value",0))}）</div></div>'
      f'<div class="fcard"><div class="fk">RS 中分類95業種</div><div class="fv" style="color:{"#16A34A" if (rsmid or 0)>=0 else "#DC2626"}">{num(rsmid) if rsmid is not None else "—"} 人</div><div class="fkk">牽引: {r.get("top_rs_industry_mid","—")}（{num(r.get("top_rs_value_mid",0))}）</div></div>'
      f'<div class="fcard"><div class="fk">競争力の評価</div><div class="fv" style="color:{"#16A34A" if a["rs"]>=0 else "#DC2626"}">{"全国平均超" if a["rs"]>=0 else "全国平均未満"}</div><div class="fkk">雇用比 {a["rs_share"]:+.2f}%</div></div></div>'
      f'<p class="ebnote">※ RSがプラス＝全国平均を上回る競争力で雇用純増。将来の基盤雇用の先行シグナル。期間は2016→2021の1期間（経済センサス、より新しい版は未公表）。多期間の推移は2011センサス取込が必要（未取得）。</p></div>')
    return f'''<div class="panel">
      <div class="ph"><div><div class="pt">🏙️ CI102 エリア総合診断 <span class="muted">— {name}</span></div>
        <div class="psub">需要・供給・強み・将来性をCI102手法で統合し、購入/売却の「将来性」を判定 <span class="scope">経済基盤: 都道府県レベル（{name}）</span></div></div>
        <div class="ov" style="border-color:{st_col}"><div class="ovl">総合スコア</div><div class="ovv" style="color:{st_col}">{a["overall"]}<span>/100</span></div></div></div>
      <div class="chips">{chip("需要",a["demand"])}{chip("供給",a["supply"])}{chip("将来性",a["future"])}</div>
      <div class="stance" style="background:{st_col}12;border-left:5px solid {st_col}"><div class="stl">総合スタンス（購入・売却判断）</div><div class="stv" style="color:{st_col}">{st_lab}</div><div class="stx">{st_txt}</div></div>
      {cmp_html}
      {rs_html}
      <div class="grid2">{sect("📈","需要 — 買い手・借り手の量と将来",a["demand"],dt)}{sect("🏭","供給 — 雇用基盤の厚み",a["supply"],sut)}{sect("💪","このエリアの強み — 何で稼ぐ地域か",max(a["demand"],a["future"]),strt)}{sect("🔭","将来性 — 伸びるか縮むか",a["future"],fut)}</div>
      <div class="calc"><div class="ebt2" style="color:#1D4ED8">🧮 指標の計算フロー（CI102） <span class="ebsub">— LQ → 基盤雇用 → EBM → PER → 人口・世帯・住宅需要（{name}・中分類）</span></div>{steps_html}<p class="stnote">※ 乗数(EBM/PER)は現在の産業構造が続くと仮定した理論値。基盤雇用はLQ&gt;1産業の超過雇用の合計。</p></div>
      <div class="eb"><div class="ebt2">🏭 経済基盤分析 <span class="ebsub">— {name}：域外から所得を呼ぶ「基盤雇用」</span></div>
        <div class="eblab"><span class="ebg">基盤雇用 {a["basic_mid"]:,}人（{bpct:.1f}%）</span><span class="ebn">非基盤雇用 {nonb:,}人</span></div>
        <div class="ebbar"><i style="width:{min(100,bpct):.1f}%"></i></div>
        <p class="ebp">基盤を担う特化産業（LQが1を超える＝域外を稼ぐ）:</p><div class="ebchips">{chips_html}</div>
        <p class="ebnote">※ 中分類95業種で算出（大分類はLQ&gt;1業種が少なく基盤を過小評価 / Mulligan凸性質）。参考: 大分類EBM {r.get("ebm",0):.1f}。</p></div>
      {fd_html}
      {needs_html}
      <div class="rr"><div class="rbox rok"><div class="rt" style="color:#047857">✓ 投資の根拠（このエリアの強み）</div>{st_items}</div>
        <div class="rbox rng"><div class="rt" style="color:#be123c">⚠ 留意すべきリスク</div>{rk_items}</div></div>
      <div class="foot">CI102: LQ特化・シフトシェア・小売ギャップ・EBM/PER（2021経済センサス）＋人口モメンタム（2025国勢調査速報）＋将来推計（社人研）を統合。将来性=直近需要×競争力(RS/雇用比)×長期推計。</div>
    </div>'''
picks=[("福岡県",d["40"]),("秋田県",d["5"]),("東京都",d["13"])]
body="".join(panel(n,r) for n,r in picks)
html=f'''<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>CI102 エリア総合診断</title><style>
*{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:'Yu Gothic','Hiragino Kaku Gothic ProN','Noto Sans JP',system-ui,sans-serif;background:#EEF1F5;padding:28px;color:#0F172A}}
h0{{display:block;max-width:900px;margin:0 auto 8px;font-size:13px;color:#64748B;font-weight:700}}
.wrap{{display:flex;flex-direction:column;gap:24px;max-width:900px;margin:0 auto}}
.panel{{background:#fff;border-radius:18px;padding:22px 24px;box-shadow:0 6px 24px rgba(15,23,42,.08),0 1px 3px rgba(15,23,42,.06)}}
.ph{{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;margin-bottom:16px}}
.pt{{font-size:17px;font-weight:800}}.pt .muted{{color:#64748B;font-weight:600}}
.psub{{font-size:11px;color:#94A3B8;margin-top:2px}}
.scope{{display:inline-block;background:#F1F5F9;border-radius:999px;padding:1px 8px;font-size:10px;font-weight:700;color:#475569;margin-left:8px}}
.ov{{flex:none;border:2px solid;border-radius:12px;padding:8px 14px;text-align:center;min-width:96px}}
.ovl{{font-size:9px;font-weight:700;color:#64748B}}.ovv{{font-size:26px;font-weight:900;line-height:1}}.ovv span{{font-size:12px;color:#94A3B8}}
.chips{{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px}}
.chip{{background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:10px 12px}}
.cl{{font-size:11px;color:#64748B;font-weight:700}}.cv{{font-size:16px;font-weight:900;margin-top:1px}}
.cs{{font-size:11px;color:#334155;font-weight:700}}.cs span{{color:#94A3B8}}
.bar{{height:5px;background:#E2E8F0;border-radius:3px;margin-top:5px;overflow:hidden}}.bar i{{display:block;height:100%;border-radius:3px}}
.stance{{border-radius:12px;padding:12px 16px;margin-bottom:16px}}
.stl{{font-size:10px;font-weight:700;color:#64748B;letter-spacing:.06em}}.stv{{font-size:21px;font-weight:900;margin:1px 0 3px}}.stx{{font-size:12.5px;line-height:1.5;color:#1E293B}}
.grid2{{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}}
.sect{{border:1px solid #E2E8F0;border-radius:12px;padding:13px 15px;background:#FCFDFE}}
.sh{{display:flex;align-items:center;gap:7px;margin-bottom:7px}}.si{{font-size:16px}}.stt{{font-size:13px;font-weight:800;flex:1}}
.sr{{color:#fff;font-size:11px;font-weight:800;padding:2px 9px;border-radius:999px}}.sb{{font-size:12px;line-height:1.6;color:#334155}}
.ebt2{{font-size:13px;font-weight:800;color:#1B2A4A;margin-bottom:4px}}.ebsub{{font-weight:600;color:#94A3B8;font-size:11px;margin-left:4px}}
.calc{{border:2px solid rgba(37,99,235,.2);background:rgba(37,99,235,.03);border-radius:12px;padding:14px 16px;margin-bottom:14px}}
.step{{border:1px solid #E2E8F0;background:#fff;border-radius:10px;padding:9px 11px;margin-top:9px}}
.sth{{display:flex;align-items:center;gap:8px}}.stn{{flex:none;width:20px;height:20px;border-radius:999px;background:#2563EB;color:#fff;font-size:11px;font-weight:900;display:grid;place-items:center}}
.stt2{{font-size:12px;font-weight:800}}
.fml{{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;color:#334155;margin-top:5px}}
.cal{{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;color:#047857}}
.stnote{{font-size:11px;color:#94A3B8;margin-top:2px}}
.eb{{border:2px solid rgba(27,42,74,.15);background:rgba(27,42,74,.03);border-radius:12px;padding:14px 16px;margin-bottom:14px}}
.eblab{{display:flex;justify-content:space-between;font-size:10px;font-weight:700;margin:10px 0 4px}}.ebg{{color:#047857}}.ebn{{color:#64748B}}
.ebbar{{height:16px;background:#E2E8F0;border-radius:6px;overflow:hidden}}.ebbar i{{display:block;height:100%;background:#16A34A}}
.ebp{{font-size:11.5px;line-height:1.6;color:#334155;margin-top:8px}}
.ebchips{{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}}
.ebchip{{border:1px solid #E2E8F0;background:#fff;border-radius:999px;padding:2px 10px;font-size:11px;font-weight:700}}.ebchip em{{color:#059669;font-style:normal}}
.ebnote{{font-size:10px;color:#94A3B8;margin-top:8px}}.mut{{color:#94A3B8}}
.fut{{border:2px solid rgba(13,148,136,.25);background:rgba(13,148,136,.04);border-radius:12px;padding:14px 16px;margin-bottom:14px}}
.fcards{{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:8px}}
.fcard{{border:1px solid #E2E8F0;background:#fff;border-radius:10px;padding:9px;text-align:center}}
.fk{{font-size:10px;font-weight:700;color:#64748B}}.fv{{font-size:18px;font-weight:900}}.fkk{{font-size:10px;color:#94A3B8}}
.needs{{border:1px solid #E2E8F0;background:#fff;border-radius:12px;padding:14px 16px;margin-bottom:14px}}
.ngrid{{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px}}
.need{{display:flex;gap:8px;align-items:flex-start;border:1px solid #E2E8F0;background:#F8FAFC;border-radius:10px;padding:8px 10px}}
.ni{{font-size:16px}}.nl{{font-size:12px;font-weight:800}}.nw{{font-size:11px;color:#64748B;line-height:1.4}}
.rr{{display:grid;grid-template-columns:1fr 1fr;gap:12px}}
.rbox{{border-radius:12px;padding:12px 15px}}.rok{{background:#ECFDF5;border:1px solid #A7F3D0}}.rng{{background:#FFF1F2;border:1px solid #FECDD3}}
.rt{{font-size:12px;font-weight:800;margin-bottom:6px}}.rbox p{{font-size:11.5px;line-height:1.55;color:#334155;margin:2px 0}}
.foot{{font-size:10px;color:#94A3B8;margin-top:14px;border-top:1px solid #F1F5F9;padding-top:9px}}
.cmp{{border:1px solid #E2E8F0;background:#fff;border-radius:12px;padding:12px 15px;margin-bottom:14px}}
.cgrid{{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px}}
.ccard{{border:1px solid #E2E8F0;background:#F8FAFC;border-radius:10px;padding:8px 11px}}
.cval{{font-size:13px;font-weight:800;margin-top:1px}}.cd{{font-size:11px;font-weight:700;margin-top:2px}}
@media(max-width:680px){{.grid2,.chips,.rr,.fcards,.ngrid{{grid-template-columns:1fr}}}}
</style></head><body><h0>UIプレビュー — CI102 エリア総合診断（計算フロー・将来需要予測・ニーズ / 実データ・都道府県レベル）</h0>
<div class="wrap">{body}</div></body></html>'''
Path("ci102-nextjs/public/ui-preview-diagnosis.html").write_text(html,encoding="utf-8")
print("updated preview")
