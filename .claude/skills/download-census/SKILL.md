---
description: "e-Stat経済センサスの全国データを一括ダウンロードする。キャッシュが古い/存在しない場合、または新しい調査年度のデータが公開された場合に使う。"
---

# 全国経済センサスデータ一括ダウンロード

## トリガー条件

- `data/cache/` 配下のCSVが存在しない
- ユーザーが「データを更新して」「ダウンロードして」と依頼した
- 新しい経済センサス（次回2026年）の結果が公表された

## 手順

```python
from api.estat import create_estat_client
from config import get_settings
from data.census_cache import download_all_datasets

settings = get_settings()
client = create_estat_client(app_id=settings.estat_app_id, cache_dir=settings.cache_dir)
results = download_all_datasets(client, settings.cache_dir)
```

## データセット一覧（5つ）

1. `census_employment_major_2021.csv` — 産業大分類別従業者数（LQ計算用）
2. `census_employment_mid_2021.csv` — 産業中分類別従業者数（詳細LQ）
3. `census_population_2020.csv` — 人口・世帯数（PER計算用）
4. `census_retail_sales_2021.csv` — 小売販売額（ギャップ分析Supply）
5. `census_establishments_2021.csv` — 事業所数（集積密度）

## 注意事項

- ESTAT_APP_ID が `.env` に設定されていること
- 初回は5テーブル合計で約2分かかる
- 2回目以降はCSVキャッシュから即座に読み込み
- 次回経済センサス（2026年）公表時はファイル名のyearを変更
