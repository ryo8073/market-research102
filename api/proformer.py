"""Proformer 不動産投資診断プロ API クライアント.

API仕様:
  - Endpoint: https://api.proformer.ai/api/v1/exports/{external_id}
  - Auth: Authorization: Bearer {api_key}
  - Response: JSON with property, income, NOI, financing, investment_performance
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import requests


BASE_URL = "https://api.proformer.ai/api/v1/exports"


@dataclass
class ProformerProperty:
    """Property info from Proformer."""
    name: str = ""
    type: str = ""
    location: str = ""
    acquisition_price: float = 0.0


@dataclass
class ProformerIncome:
    """Income info from Proformer."""
    gpi_annual: float = 0.0      # Gross Potential Income
    egi_annual: float = 0.0      # Effective Gross Income
    vacancy_rate: float = 0.0    # %


@dataclass
class ProformerFinancing:
    """Financing info from Proformer."""
    loan_amount: float = 0.0
    ltv: float = 0.0             # Loan-to-Value ratio
    interest_rate: float = 0.0
    term_years: int = 0
    dscr: float = 0.0            # Debt Service Coverage Ratio


@dataclass
class ProformerPerformance:
    """Investment performance from Proformer."""
    cap_rate: float = 0.0
    irr: float = 0.0
    npv: float = 0.0


@dataclass
class ProformerAnalysis:
    """Complete analysis result from Proformer API."""
    memo: str = ""
    property: ProformerProperty = field(default_factory=ProformerProperty)
    income: ProformerIncome = field(default_factory=ProformerIncome)
    noi_annual: float = 0.0
    financing: ProformerFinancing = field(default_factory=ProformerFinancing)
    performance: ProformerPerformance = field(default_factory=ProformerPerformance)
    disclaimer: str = ""
    raw: dict = field(default_factory=dict)


def fetch_proformer_analysis(
    api_key: str,
    external_id: str,
    timeout: int = 15,
) -> Optional[ProformerAnalysis]:
    """Fetch property analysis from Proformer API.

    Parameters
    ----------
    api_key : Bearer token for Proformer API
    external_id : Property data ID from Proformer
    timeout : request timeout in seconds

    Returns
    -------
    ProformerAnalysis or None on failure
    """
    if not api_key or not external_id:
        return None

    try:
        r = requests.get(
            f"{BASE_URL}/{external_id}",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=timeout,
        )
        r.raise_for_status()
        data = r.json()

        if data.get("status") != "ok":
            return None

        export = data.get("export", {})

        prop = export.get("property", {})
        inc = export.get("income", {})
        fin = export.get("financing", {})
        perf = export.get("investment_performance", {})

        return ProformerAnalysis(
            memo=export.get("memo", ""),
            property=ProformerProperty(
                name=prop.get("name", ""),
                type=prop.get("type", ""),
                location=prop.get("location", ""),
                acquisition_price=float(prop.get("acquisition_price", 0)),
            ),
            income=ProformerIncome(
                gpi_annual=float(inc.get("gpi_annual", 0)),
                egi_annual=float(inc.get("egi_annual", 0)),
                vacancy_rate=float(inc.get("vacancy_rate", 0)),
            ),
            noi_annual=float(export.get("noi_annual", 0)),
            financing=ProformerFinancing(
                loan_amount=float(fin.get("loan_amount", 0)),
                ltv=float(fin.get("ltv", 0)),
                interest_rate=float(fin.get("interest_rate", 0)),
                term_years=int(fin.get("term_years", 0)),
                dscr=float(fin.get("dscr", 0)),
            ),
            performance=ProformerPerformance(
                cap_rate=float(perf.get("cap_rate", 0)),
                irr=float(perf.get("irr", 0)),
                npv=float(perf.get("npv", 0)),
            ),
            disclaimer=export.get("disclaimer", ""),
            raw=export,
        )
    except (requests.RequestException, ValueError, KeyError):
        return None
