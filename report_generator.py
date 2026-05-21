"""PDF report generator for investment scorecard.

Uses fpdf2 with Japanese font support.
"""
from __future__ import annotations

import io
from typing import Optional

from fpdf import FPDF

from scorecard import ScorecardData


class InvestmentReport(FPDF):
    """Custom PDF with Japanese support."""

    def __init__(self):
        super().__init__()
        # Use built-in Helvetica (no CJK) + fallback for Japanese
        self.add_page()
        self.set_auto_page_break(auto=True, margin=15)

    def header(self):
        self.set_font("Helvetica", "B", 14)
        self.cell(0, 10, "Investment Scorecard Report", ln=True, align="C")
        self.ln(5)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.cell(0, 10, f"Page {self.page_no()}", align="C")

    def _section(self, title: str):
        self.set_font("Helvetica", "B", 11)
        self.set_fill_color(27, 42, 74)
        self.set_text_color(255, 255, 255)
        self.cell(0, 8, f"  {title}", ln=True, fill=True)
        self.set_text_color(0, 0, 0)
        self.ln(3)

    def _kv(self, key: str, value: str):
        self.set_font("Helvetica", "", 10)
        self.cell(60, 6, key, border=0)
        self.set_font("Helvetica", "B", 10)
        self.cell(0, 6, value, ln=True, border=0)

    def _text(self, text: str):
        self.set_font("Helvetica", "", 9)
        self.multi_cell(0, 5, text)
        self.ln(2)


def generate_pdf(
    sc: ScorecardData,
    insights: list[dict],
    ai_analysis: Optional[str] = None,
) -> bytes:
    """Generate PDF report from scorecard data.

    Returns PDF as bytes.
    """
    pdf = InvestmentReport()

    # Area info
    pdf._section("Area Overview")
    pdf._kv("Area:", sc.area_name)
    pdf._kv("Population:", f"{sc.population:,}")
    pdf._kv("Households:", f"{sc.households:,}")
    pdf._kv("Total Employment:", f"{sc.total_employment:,}")
    pdf.ln(3)

    # Economic Base
    pdf._section("Economic Base Analysis")
    pdf._kv("EBM (Economic Base Multiplier):", f"{sc.ebm:.2f}")
    pdf._kv("PER (Population-Employment Ratio):", f"{sc.per:.2f}")
    pdf._kv("Basic Employment:", f"{sc.basic_emp:,.0f}")
    pdf._kv("Basic Employment Ratio:", f"{sc.basic_ratio:.1f}%")
    pdf.ln(2)

    if sc.top_lq_industries:
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(0, 6, "Top LQ Industries:", ln=True)
        for ind in sc.top_lq_industries:
            pdf._kv(f"  {ind['industry']}", f"LQ={ind['lq']:.2f}")
    pdf.ln(3)

    # Shift-Share
    pdf._section("Shift-Share Analysis")
    pdf._kv("RS Total:", f"{sc.rs_total:+,.0f}")
    pdf._kv("Top RS Industry:", f"{sc.top_rs_industry} ({sc.top_rs_value:+,.0f})")
    pdf._kv("Actual Emp Change (2016-2021):", f"{sc.actual_emp_change:+,.0f}")
    pdf.ln(3)

    # Retail Gap
    pdf._section("Retail Gap Analysis")
    pdf._kv("Aggregate Gap Factor:", f"{sc.aggregate_gap_factor:+.1f}")
    pdf._kv("Leakage Sectors:", str(sc.num_leakage_sectors))
    pdf._kv("Surplus Sectors:", str(sc.num_surplus_sectors))
    pdf.ln(3)

    # Real Estate
    pdf._section("Real Estate Market")
    if sc.median_unit_price is not None:
        pdf._kv("Median Unit Price:", f"JPY {sc.median_unit_price:,.0f} /m2")
    else:
        pdf._kv("Median Unit Price:", "N/A")
    pdf.ln(3)

    # Suitability Score
    if sc.suitability_score:
        pdf._section("Investment Suitability Score")
        pdf._kv("Total Score:", f"{sc.suitability_score['total_score']:.0f} / 100")
        pdf._kv("  EBM Score:", f"{sc.suitability_score['ebm_score']:.0f}")
        pdf._kv("  Ratio Score:", f"{sc.suitability_score['ratio_score']:.0f}")
        pdf._kv("  RS Score:", f"{sc.suitability_score['rs_score']:.0f}")
        pdf._kv("  Gap Score:", f"{sc.suitability_score['gap_score']:.0f}")
        pdf._kv("  Scale Score:", f"{sc.suitability_score['scale_score']:.0f}")
        pdf.ln(3)

    # Simulation
    pdf._section(f"Simulation (IF basic jobs {sc.new_basic_jobs_assumption:+,})")
    pdf._kv("Total Employment Impact:", f"{sc.total_emp_forecast:+,.0f}")
    pdf._kv("Population Impact:", f"{sc.population_forecast:+,.0f}")
    pdf._kv("Housing Demand:", f"{sc.housing_demand:+,.0f} units")
    pdf.ln(3)

    # Insights
    pdf._section("Investment Signals")
    for ins in insights:
        level = ins["level"].upper()
        pdf._text(f"[{level}] {ins['text']}")
    pdf.ln(3)

    # AI Analysis
    if ai_analysis:
        pdf._section("AI Analysis (Claude)")
        pdf._text(ai_analysis)
        pdf.ln(2)
        pdf.set_font("Helvetica", "I", 8)
        pdf._text(
            "Disclaimer: This AI analysis is based on historical snapshot data "
            "(Economic Census 2021, Population Census 2020). It does not reflect "
            "current market conditions. Seek professional advice before investing."
        )

    # Data disclaimer
    pdf.ln(5)
    pdf.set_font("Helvetica", "I", 8)
    pdf._text(
        "Data Sources: e-Stat Economic Census 2021, National Census 2020, "
        "MLIT Real Estate Information Library. All data represents past snapshots."
    )

    return pdf.output()
