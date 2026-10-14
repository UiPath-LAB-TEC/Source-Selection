"""Official-record PDFs for the contract file (SSDD or Recommendation of Award, consensus report, audit trail, cancellation memo)."""
from __future__ import annotations

from fpdf import FPDF

_SUBS = {"—": "-", "–": "-", "’": "'", "‘": "'", "“": '"', "”": '"', "…": "...", "•": "-", "·": "-", "→": "->", "≥": ">=", "≤": "<="}


def _latin(s: str) -> str:
    for a, b in _SUBS.items():
        s = s.replace(a, b)
    return s.encode("latin-1", "replace").decode("latin-1")


FEDERAL_BANNER = "SOURCE SELECTION INFORMATION - SEE FAR 2.101 AND 3.104 - SYNTHETIC DEMO DATA"
SLED_BANNER = "CONFIDENTIAL PROCUREMENT RECORD - EXEMPT FROM DISCLOSURE UNTIL BOARD ACTION - SYNTHETIC DEMO DATA"


class _Doc(FPDF):
    def __init__(self, header: str, banner: str = FEDERAL_BANNER):
        super().__init__(format="letter")
        self._header = _latin(header)
        self._banner = _latin(banner)
        self.set_margins(19, 18, 19)
        self.set_auto_page_break(True, 18)

    def header(self):
        self.set_font("helvetica", "B", 7.5)
        self.set_text_color(180, 35, 24)
        self.cell(0, 4, self._banner, new_x="LMARGIN", new_y="NEXT")
        self.set_font("helvetica", "", 7.5)
        self.set_text_color(71, 84, 103)
        self.cell(0, 4, self._header, new_x="LMARGIN", new_y="NEXT")
        self.ln(4)
        self.set_text_color(0, 0, 0)

    def footer(self):
        self.set_y(-12)
        self.set_font("helvetica", "", 7.5)
        self.set_text_color(71, 84, 103)
        self.cell(0, 4, f"Page {self.page_no()}", align="R")


def render(title: str, header: str, sections: list[tuple[str, str]], sled: bool = False) -> bytes:
    """sections: (heading, body) pairs. Body paragraphs are separated by blank lines. `sled`: a District record's banner."""
    pdf = _Doc(header, SLED_BANNER if sled else FEDERAL_BANNER)
    pdf.add_page()
    pdf.set_font("helvetica", "B", 15)
    pdf.multi_cell(0, 7, _latin(title), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)
    for heading, body in sections:
        if heading:
            pdf.set_font("helvetica", "B", 11)
            pdf.multi_cell(0, 6, _latin(heading), new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("helvetica", "", 9.5)
        for para in (body or "").split("\n\n"):
            pdf.multi_cell(0, 5, _latin(para.strip()), new_x="LMARGIN", new_y="NEXT")
            pdf.ln(1.5)
        pdf.ln(2)
    return bytes(pdf.output())
