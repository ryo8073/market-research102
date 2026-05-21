"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  prefCode: number;
  prefName: string;
}

export default function MapTab({ prefCode, prefName }: Props) {
  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">全国マップ（都道府県別）</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-dashed h-64 flex items-center justify-center text-muted-foreground text-sm">
              <div className="text-center">
                <p className="font-medium">Plotly Choropleth Map</p>
                <p className="text-xs mt-1">GeoJSON（3.3MB）読込後に表示</p>
                <p className="text-xs">指標切替: LQ / RS / 漏損係数 / 基盤雇用比率</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{prefName} 県内マップ（市区町村別）</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-dashed h-64 flex items-center justify-center text-muted-foreground text-sm">
              <div className="text-center">
                <p className="font-medium">Municipality Choropleth</p>
                <p className="text-xs mt-1">TopoJSON読込後に表示</p>
                <p className="text-xs">産業別LQ / 基盤雇用比率</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">セグメンテーション</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {[
              { icon: "🏢", name: "都市サービス集積型", color: "#1B2A4A" },
              { icon: "⚙️", name: "工業基盤型", color: "#2A9D8F" },
              { icon: "🛒", name: "商業・観光型", color: "#D4A843" },
              { icon: "🏛️", name: "公務・教育型", color: "#6B7280" },
              { icon: "📉", name: "高齢縮小型", color: "#E76F51" },
              { icon: "⚖️", name: "均衡型", color: "#9CA3AF" },
            ].map((seg) => (
              <div key={seg.name} className="text-center p-3 rounded-lg border">
                <div className="text-2xl">{seg.icon}</div>
                <p className="text-xs mt-1 font-medium" style={{ color: seg.color }}>{seg.name}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            国勢調査の年齢構成・世帯人員・産業構成から市区町村を6タイプに分類。
            e-Stat CSVデータ接続後に各市区町村のセグメントが表示されます。
          </p>
        </CardContent>
      </Card>

      <div className="rounded-lg bg-slate-50 p-4 text-xs text-muted-foreground">
        <p className="font-medium">Next.js版 地図実装ロードマップ</p>
        <ul className="mt-2 space-y-1 list-disc list-inside">
          <li>GeoJSON/TopoJSON をpublic/geo/に配置し、fetch + Plotly choropleth_mapbox で描画</li>
          <li>react-plotly.js の dynamic import でSSR回避（実装済みパターン）</li>
          <li>都道府県比較レーダーチャート + 産業中分類ドリルダウン</li>
        </ul>
      </div>
    </div>
  );
}
