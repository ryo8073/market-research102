"""都道府県コード・市区町村コード・産業分類コードの静的参照データ。

RESAS API / e-Stat API の全リクエストに必要な基盤データ。
"""
from __future__ import annotations

# ---------------------------------------------------------------------------
# 都道府県コード（JIS X 0401）: 1〜47
# ---------------------------------------------------------------------------
PREFECTURES: dict[int, str] = {
    1: "北海道", 2: "青森県", 3: "岩手県", 4: "宮城県", 5: "秋田県",
    6: "山形県", 7: "福島県", 8: "茨城県", 9: "栃木県", 10: "群馬県",
    11: "埼玉県", 12: "千葉県", 13: "東京都", 14: "神奈川県", 15: "新潟県",
    16: "富山県", 17: "石川県", 18: "福井県", 19: "山梨県", 20: "長野県",
    21: "岐阜県", 22: "静岡県", 23: "愛知県", 24: "三重県", 25: "滋賀県",
    26: "京都府", 27: "大阪府", 28: "兵庫県", 29: "奈良県", 30: "和歌山県",
    31: "鳥取県", 32: "島根県", 33: "岡山県", 34: "広島県", 35: "山口県",
    36: "徳島県", 37: "香川県", 38: "愛媛県", 39: "高知県", 40: "福岡県",
    41: "佐賀県", 42: "長崎県", 43: "熊本県", 44: "大分県", 45: "宮崎県",
    46: "鹿児島県", 47: "沖縄県",
}


def get_prefecture_name(code: int) -> str:
    """都道府県コード → 名称。見つからない場合は空文字列。"""
    return PREFECTURES.get(code, "")


def get_prefecture_code(name: str) -> int:
    """都道府県名 → コード。見つからない場合は 0。"""
    for code, n in PREFECTURES.items():
        if n == name:
            return code
    return 0


def prefecture_options() -> list[tuple[int, str]]:
    """Streamlit セレクトボックス用の (code, name) リスト。"""
    return [(code, name) for code, name in PREFECTURES.items()]


# ---------------------------------------------------------------------------
# e-Stat 地域コード構築
# ---------------------------------------------------------------------------
def build_area_code(pref_code: int, city_code: int | None = None) -> str:
    """e-Stat 用の5桁地域コードを構築する。

    pref_code=13, city_code=101 → "13101"（東京都千代田区）
    pref_code=13, city_code=None → "13000"（東京都全体）
    """
    if city_code is None:
        return f"{pref_code:02d}000"
    return f"{pref_code:02d}{city_code:03d}"


# ---------------------------------------------------------------------------
# 都市圏（MSA相当の経済圏）定義
#
# CI102の経済基盤理論はMSA（Metropolitan Statistical Area）= 通勤圏
# 経済単位を前提とする。日本の市町村単位だと通勤流入・流出で
# EBM・PER・基盤雇用が著しく歪むため、近隣を合算した経済圏で評価する。
#
# 構成は、国土交通省「都市圏」と総務省「大都市圏」を参考に簡略化。
# 各経済圏は都道府県コード集合で定義する（県単位の合算 = 経済圏近似）。
# 厳密な通勤圏ではないが、CI102分析の歪みは大幅に減る。
# ---------------------------------------------------------------------------
METROPOLITAN_AREAS: dict[str, dict] = {
    "tokyo": {
        "name": "東京圏（首都圏）",
        "prefectures": [13, 14, 11, 12],  # 東京・神奈川・埼玉・千葉
        "core_pref": 13,
        "note": "総務省『大都市圏』の東京都中心都市圏（1都3県）",
    },
    "osaka": {
        "name": "大阪圏（京阪神）",
        "prefectures": [27, 28, 26, 29],  # 大阪・兵庫・京都・奈良
        "core_pref": 27,
        "note": "京阪神大都市圏（大阪・京都・神戸を中心とする経済圏）",
    },
    "nagoya": {
        "name": "名古屋圏（中京）",
        "prefectures": [23, 24, 21],  # 愛知・三重・岐阜
        "core_pref": 23,
        "note": "中京大都市圏（愛知・三重・岐阜の通勤圏）",
    },
    "fukuoka": {
        "name": "福岡都市圏",
        "prefectures": [40, 41],  # 福岡・佐賀
        "core_pref": 40,
        "note": "福岡市を中心とする九州北部経済圏",
    },
    "sapporo": {
        "name": "札幌都市圏",
        "prefectures": [1],
        "core_pref": 1,
        "note": "北海道は道全体で1経済圏として扱う",
    },
    "sendai": {
        "name": "仙台都市圏",
        "prefectures": [4],
        "core_pref": 4,
        "note": "宮城県を中心とする東北の中核都市圏",
    },
    "hiroshima": {
        "name": "広島都市圏",
        "prefectures": [34],
        "core_pref": 34,
        "note": "広島県を中心とする中四国の中核都市圏",
    },
}


def get_metro_area_options() -> list[tuple[str, str]]:
    """UI セレクタ用の (key, display_name) リスト。"""
    return [(k, v["name"]) for k, v in METROPOLITAN_AREAS.items()]


def get_metro_prefectures(metro_key: str) -> list[int]:
    """都市圏キーから構成都道府県コードのリスト。"""
    area = METROPOLITAN_AREAS.get(metro_key)
    return area["prefectures"] if area else []
