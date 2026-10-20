"""Proposal extraction with IXP: the cover letter or transmittal (offeror identity, signatory, certifications), the price
schedule (lines and stated total) and the past performance references, each read by its own IXP project's live model.
When IXP can't be reached the regex parsers in rules.py take over, so intake never stops; ExtractionJson records which
of the two supplied each volume and how confident IXP was.
"""
from __future__ import annotations

import os
import re
from typing import Any

import repo
import rules

# The SDK finds an IXP project by its title (the uip CLI's slugged project names don't match).
PROJECTS = {
    "cover": os.environ.get("SS_IXP_COVER", "Source Selection Proposal Cover"),
    "price": os.environ.get("SS_IXP_PRICE", "Source Selection Price Schedule"),
    "pastPerformance": os.environ.get("SS_IXP_PAST_PERFORMANCE", "Source Selection Past Performance"),
}
TAG = os.environ.get("SS_IXP_TAG", "live")
ERRORS: dict[str, str] = {}  # last failure per file path, for ExtractProposals to report


def ixp(volume: str, path: str) -> dict[str, list[dict[str, dict]]] | None:
    """{field group: [occurrence {field: {"value", "confidence"}}]} from the volume's IXP project, or None when IXP is
    switched off (SS_IXP_OFF), has no project for the volume, or fails."""
    project = PROJECTS.get(volume)
    if not path or not project or os.environ.get("SS_IXP_OFF"):
        return None
    try:
        from uipath.platform.documents import ProjectType
        res = repo.retry(lambda: repo.sdk().documents.extract(project_name=project, tag=TAG, file_path=path, project_type=ProjectType.IXP))
    except Exception as exc:  # no project, no permission, model not published: fall back to the rules
        ERRORS[path] = f"{type(exc).__name__}: {exc}"[:500]
        print(f"IXP extraction unavailable for {volume}: {ERRORS[path]}")
        return None
    return groups(getattr(res, "data_projection", None) or [])


def groups(projection: list[Any]) -> dict[str, list[dict[str, dict]]]:
    """Flatten the SDK's projection. A repeatable group arrives either as one entry per occurrence or as one entry whose
    field values repeat; either way a field name seen again starts the next occurrence."""
    out: dict[str, list[dict[str, dict]]] = {}
    for g in projection:
        rows = out.setdefault(g.field_group_name, [])
        row: dict[str, dict] = {}
        for f in g.field_values:
            if f.name in row:
                rows.append(row)
                row = {}
            row[f.name] = {"value": f.value, "confidence": f.confidence}
        if row:
            rows.append(row)
    return out


def _v(row: dict | None, field: str) -> str:
    return str(((row or {}).get(field) or {}).get("value") or "").strip()


def _conf(rows: list[dict]) -> float | None:
    found = [f["confidence"] for r in rows for f in r.values() if f.get("value") not in (None, "") and f.get("confidence") is not None]
    return round(min(found), 3) if found else None


def entity_id(value: str) -> str:
    """A SAM UEI, CAGE code or state vendor ID: upper case, no spaces."""
    return re.sub(r"\s+", "", value or "").upper()


def amount(value: Any) -> float | None:
    """A Monetary Quantity ("19720000 USD", "$19,720,000.00") as a number."""
    m = re.search(r"-?[\d,]+(?:\.\d+)?", str(value or ""))
    return float(m.group(0).replace(",", "")) if m else None


def _flag(row: dict | None, field: str) -> bool | None:
    v = _v(row, field).lower()
    return True if v == "true" else False if v == "false" else None


def cover(path: str, text: str) -> dict:
    """Offeror identity, signatory and certifications. Same keys as rules.parse_cover, plus what only IXP reads."""
    g = ixp("cover", path)
    if g is None:
        return {**rules.parse_cover(text), "source": "rules"}
    off = (g.get("Offeror") or [{}])[0]
    cert = (g.get("Certifications") or [{}])[0]
    name, title = _v(off, "Signatory name"), _v(off, "Signatory title")
    return {
        "name": _v(off, "Legal name"), "uei": entity_id(_v(off, "Vendor ID")), "cage": entity_id(_v(off, "Vendor code")),
        "signatory": f"{name}, {title}" if name and title else name,
        "address": _v(off, "Address"), "solicitation": _v(off, "Solicitation number"), "validityDays": _v(off, "Offer validity days"),
        "amendments": _v(off, "Amendments acknowledged"), "dated": _v(off, "Date signed")[:10],
        "certifications": {k: _flag(cert, f) for k, f in (("samRepsCurrent", "SAM reps and certs current"), ("nonCollusion", "Non-collusion affidavit"),
                                                           ("debarment", "Suspension and debarment certification"), ("dataPrivacy", "Student data privacy agreement"))},
        "certified": _flag(cert, "SAM reps and certs current") is not False,
        "source": "IXP", "confidence": _conf([off, cert]),
    }


def price(path: str, text: str) -> tuple[list[dict], float | None, dict]:
    """Price lines and the stated total, and what to record about where they came from."""
    g = ixp("price", path)
    if g is None:
        lines, stated = rules.parse_price(text)
        return lines, stated, {"source": "rules"}
    rows = g.get("Price line") or []
    lines = [{"clin": _v(r, "Line number"), "description": _v(r, "Description"), "amount": amount(_v(r, "Line total"))} for r in rows]
    lines = [x for x in lines if x["clin"] and x["amount"] is not None]
    stated = amount(_v((g.get("Price summary") or [{}])[0], "Stated total"))
    return lines, stated, {"source": "IXP", "confidence": _conf(rows + (g.get("Price summary") or []))}


def references(path: str) -> tuple[list[dict], dict]:
    """Past performance references the offeror claims. IXP only: there is no rules fallback for narrative."""
    g = ixp("pastPerformance", path)
    if g is None:
        return [], {"source": "none"}
    rows = g.get("Reference") or []
    refs = [{"program": _v(r, "Program"), "customer": _v(r, "Customer"), "contract": _v(r, "Contract number"),
             "value": amount(_v(r, "Contract value")), "start": _v(r, "Period start"), "end": _v(r, "Period end"),
             "rating": _v(r, "Claimed rating"), "relevance": _v(r, "Relevance")} for r in rows]
    return [r for r in refs if r["contract"] or r["program"]], {"source": "IXP", "confidence": _conf(rows)}
