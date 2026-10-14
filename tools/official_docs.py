"""Shared look for the synthetic solicitation documents: Times body text, numbered section headings, ruled tables and
a running header and footer with "Page X of Y", the way a federal solicitation package reads. Every page still carries
the red synthetic-demo banner, so nothing here passes for a real Government document.
"""
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import Paragraph, Table, TableStyle

INK = colors.HexColor("#111111")
RULE = colors.HexColor("#444444")
SHADE = colors.HexColor("#e9e9e9")
RED = colors.HexColor("#b42318")

TITLE = ParagraphStyle("title", fontName="Times-Bold", fontSize=13, leading=16, alignment=TA_CENTER, spaceAfter=2)
SUBTITLE = ParagraphStyle("subtitle", fontName="Times-Roman", fontSize=10.5, leading=13, alignment=TA_CENTER, spaceAfter=10)
H = ParagraphStyle("h", fontName="Times-Bold", fontSize=11, leading=14, spaceBefore=9, spaceAfter=4)
BODY = ParagraphStyle("body", fontName="Times-Roman", fontSize=10.5, leading=14, spaceAfter=6)
CELL = ParagraphStyle("cell", fontName="Times-Roman", fontSize=9.5, leading=12)
CELL_B = ParagraphStyle("cellb", parent=CELL, fontName="Times-Bold")
LABEL = ParagraphStyle("label", fontName="Helvetica", fontSize=6.3, leading=7.6)
VALUE = ParagraphStyle("value", fontName="Helvetica", fontSize=8.6, leading=10.4)
VALUE_B = ParagraphStyle("valueb", parent=VALUE, fontName="Helvetica-Bold")


def ruled(rows, widths, header=True, style=CELL, head_style=CELL_B, align_right_from=None):
    """A bordered table; the first row is a shaded header. Strings become paragraphs so long text wraps."""
    body = [[c if not isinstance(c, str) else Paragraph(c, head_style if header and r == 0 else style) for c in row] for r, row in enumerate(rows)]
    t = Table(body, colWidths=widths, repeatRows=1 if header else 0)
    cmds = [("GRID", (0, 0), (-1, -1), 0.5, RULE), ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]
    if header:
        cmds.append(("BACKGROUND", (0, 0), (-1, 0), SHADE))
    if align_right_from is not None:
        cmds.append(("ALIGN", (align_right_from, 0), (-1, -1), "RIGHT"))
    t.setStyle(TableStyle(cmds))
    return t


def numbered_canvas(left: str, right: str, marking: str = "", skip_first: bool = False, banner: str = ""):
    """A canvas class that, once every page is laid out, draws the banner, running header and footer with the
    total page count. `skip_first` leaves page 1 bare apart from the banner (a standard form has its own chrome)."""

    class Numbered(rl_canvas.Canvas):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self._pages = []

        def showPage(self):
            self._pages.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            total = len(self._pages)
            for state in self._pages:
                self.__dict__.update(state)
                self._chrome(self._pageNumber, total)
                super().showPage()
            super().save()

        def _chrome(self, page, total):
            w, h = self._pagesize
            x0, x1 = 0.6 * inch, w - 0.6 * inch
            self.saveState()
            if banner:
                self.setFont("Helvetica-Bold", 7.5)
                self.setFillColor(RED)
                self.drawCentredString(w / 2, h - 0.32 * inch, banner)
            if not (skip_first and page == 1):
                self.setFillColor(INK)
                self.setFont("Times-Roman", 9)
                self.drawString(x0, h - 0.55 * inch, left)
                self.drawRightString(x1, h - 0.55 * inch, right)
                self.setStrokeColor(RULE)
                self.setLineWidth(0.6)
                self.line(x0, h - 0.6 * inch, x1, h - 0.6 * inch)
                self.line(x0, 0.62 * inch, x1, 0.62 * inch)
                self.drawRightString(x1, 0.45 * inch, f"Page {page} of {total}")
                if marking:
                    self.setFont("Times-Bold", 8.5)
                    self.drawCentredString(w / 2, 0.45 * inch, marking)
                    self.drawCentredString(w / 2, h - 0.75 * inch, marking)
            self.restoreState()

    return Numbered
