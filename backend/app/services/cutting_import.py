"""Cutting plan: customer orders from Excel, several production cycles in one file.

    Cycle      | Grade | Customer | Order ref | Type  | Width (mm) | Sheet length (mm) | Quantity | Tolerance % | Due date   | Unit
    Week 49    | 350   | Alpha    | SO-101    | reel  | 1500       |                   | 12       | 5           | 2026-12-01 |
    Week 49    | 350   | Beta     | SO-102    | sheet | 700        | 1000              | 60000    |             |            | SH1

One cutting plan per cycle (the "Cycle" text is the plan's title) on the chosen paper machine. A cycle whose title
matches a plan of the machine that is not released gets the rows added under its orders; any other cycle is a new plan.
All rows of a cycle share one grade (or none). Headers may be in English or Arabic; nothing is saved while any row
or cycle has an error. Errors are codes with parameters, the page words them in the user's language."""

import io
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.cutting import CutConverter, CutOrder, CutPlan
from app.models.operations import OpGrade, OpMachine

MAX_ROWS = 3000
MAX_ORDERS = 300  # per plan, as the orders table
SPARE_ROWS = 300  # rows with the drop-downs

COLS = ["cycle", "grade", "customer", "ref", "kind", "width", "length", "qty", "tol", "due", "unit"]
HEAD = {
    "en": [
        "Cycle",
        "Grade",
        "Customer",
        "Order ref",
        "Type",
        "Width (mm)",
        "Sheet length (mm)",
        "Quantity",
        "Tolerance %",
        "Due date",
        "Unit",
    ],
    "ar": [
        "الدورة",
        "الصنف",
        "العميل",
        "رقم الطلب",
        "النوع",
        "العرض (مم)",
        "طول الشيت (مم)",
        "الكمية",
        "السماح %",
        "تاريخ التسليم",
        "الوحدة",
    ],
}
ALIASES = {
    "cycle": ["cycle", "production cycle", "run", "plan", "الدورة", "دورة التشغيل", "السايكل", "سايكل", "الخطة"],
    "grade": ["grade", "gsm", "الصنف", "الجراماج", "الدرجة"],
    "customer": ["customer", "client", "العميل"],
    "ref": ["order ref", "order", "ref", "order no", "so", "رقم الطلب", "الطلب", "أمر البيع"],
    "kind": ["type", "kind", "النوع"],
    "width": ["width", "width mm", "العرض", "العرض مم"],
    "length": ["sheet length", "length", "sheet length mm", "طول الشيت", "الطول", "طول الفرخ"],
    "qty": ["quantity", "qty", "reels", "sheets", "الكمية", "العدد"],
    "tol": ["tolerance", "tolerance %", "tol", "السماح", "نسبة السماح"],
    "due": ["due date", "due", "delivery", "تاريخ التسليم", "التسليم", "الموعد"],
    "unit": ["unit", "converter", "sheeter", "الوحدة", "الماكينة", "الشيتر"],
}
REEL = {"reel", "reels", "r", "بكرة", "بكره", "رول"}
SHEET = {"sheet", "sheets", "s", "شيت", "فرخ", "أفرخ", "ورق"}


def _key(v: Any) -> str:
    """A header or code, compared without case, spaces, units or punctuation."""
    s = re.sub(r"\((mm|مم)\)|%", " ", str(v or "").casefold())
    return re.sub(r"[\W_]+", "", s)


_ALIAS = {_key(a): col for col, names in ALIASES.items() for a in names}


def template_xlsx(db: Session, m: OpMachine, lang: str = "en") -> bytes:
    head = HEAD.get(lang, HEAD["en"])
    grades = [
        g.code
        for g in db.execute(select(OpGrade).where(OpGrade.machine_id == m.id, OpGrade.is_active.is_(True)).order_by(OpGrade.gsm)).scalars()
    ]
    units = [
        c.code
        for c in db.execute(
            select(CutConverter).where(CutConverter.machine_id == m.id).order_by(CutConverter.sort, CutConverter.code)
        ).scalars()
    ]
    wb = Workbook()
    ws = wb.active
    assert ws is not None
    ws.title = "Orders"
    if lang == "ar":
        ws.sheet_view.rightToLeft = True
    ws.append(head)
    g0 = grades[0] if grades else None
    ws.append(["Week 49", g0, "Customer A", "SO-101", "reel", 1500, None, 12, 5, date.today(), None])
    ws.append(["Week 49", g0, "Customer B", "SO-102", "sheet", 700, 1000, 60000, 5, None, units[0] if units else None])
    for c in ws[1]:
        c.font = Font(bold=True)
        c.fill = PatternFill("solid", fgColor="92D050")
    for c in ws["J"][1:]:
        c.number_format = "yyyy-mm-dd"
    last = SPARE_ROWS + 1

    def pick(col: str, values: list[str]) -> None:
        if not values:
            return
        dv = DataValidation(type="list", formula1=f'"{",".join(values)}"', allow_blank=True, errorStyle="warning", showErrorMessage=True)
        ws.add_data_validation(dv)
        dv.add(f"{col}2:{col}{last}")

    pick("B", grades)
    pick("E", ["reel", "sheet"])
    pick("K", units)
    for col, width in zip("ABCDEFGHIJK", (16, 10, 24, 14, 9, 12, 16, 12, 12, 13, 9), strict=True):
        ws.column_dimensions[col].width = width
    ws.freeze_panes = "A2"
    h = wb.create_sheet("help")
    for line in (
        [f"Machine: {m.code} · {m.name}"],
        ["Cycle", "One cutting plan per cycle. A cycle with the title of a plan that is not released is added to it."],
        ["Type", "reel = reels of the width; sheet = sheets of width × sheet length (cut on a sheeter)"],
        ["Quantity", "reels for a reel order, sheets for a sheet order"],
        ["Grade", ", ".join(grades) or "—"],
        ["Unit", "optional: make the order on this unit only · " + (", ".join(units) or "—")],
        ["Due date", "yyyy-mm-dd (optional)"],
    ):
        h.append(line)
    h.column_dimensions["A"].width = 14
    h.column_dimensions["B"].width = 90
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _int(v: Any) -> int | None:
    if v is None or str(v).strip() == "":
        return None
    try:
        d = Decimal(str(v).replace(",", "").strip())
    except InvalidOperation:
        raise ValueError from None
    if d != d.to_integral_value():
        raise ValueError
    return int(d)


def _date(v: Any) -> date | None:
    if v is None or str(v).strip() == "":
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    s = str(v).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    raise ValueError


def _err(code: str, **params: Any) -> dict:
    return {"code": code, "params": params}


def parse(db: Session, m: OpMachine, content: bytes) -> dict[str, Any]:
    try:
        ws = load_workbook(io.BytesIO(content), read_only=True, data_only=True).worksheets[0]
    except Exception as e:  # noqa: BLE001 - malformed spreadsheets
        raise ValueError(f"Could not read file: {type(e).__name__}") from e
    grades = {_key(g.code): g for g in db.execute(select(OpGrade).where(OpGrade.machine_id == m.id)).scalars()}
    units = {_key(c.code): c for c in db.execute(select(CutConverter).where(CutConverter.machine_id == m.id)).scalars()}
    cols: dict[str, int] | None = None
    rows: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    for rn, row in enumerate(ws.iter_rows(values_only=True), start=1):
        if cols is None:
            found = {_ALIAS[_key(v)]: i for i, v in reversed(list(enumerate(row))) if _key(v) in _ALIAS}
            if {"cycle", "width", "qty"} <= found.keys():
                cols = found
            elif rn >= 10:
                break
            continue
        val = {c: (row[i] if i < len(row) else None) for c, i in cols.items()}
        if all(v is None or str(v).strip() == "" for v in val.values()):
            continue
        if len(rows) + len(errors) >= MAX_ROWS:
            raise ValueError(f"Too many rows (max {MAX_ROWS})")
        errs: list[dict] = []
        cycle = re.sub(r"\s+", " ", str(val.get("cycle") or "")).strip()
        if len(cycle) < 2 or len(cycle) > 160:
            errs.append(_err("cycle"))
        kind_raw = _key(val.get("kind"))
        kind = "reel" if kind_raw in REEL or kind_raw == "" else "sheet" if kind_raw in SHEET else None
        if kind is None:
            errs.append(_err("kind", value=str(val.get("kind"))))
        num: dict[str, int | None] = {}
        for c in ("width", "length", "qty"):
            try:
                num[c] = _int(val.get(c))
            except ValueError:
                num[c] = None
                errs.append(_err("number", column=c, value=str(val.get(c))))
        width, length, qty = num["width"], num["length"], num["qty"]
        if width is None or not 10 <= width <= 12000:
            errs.append(_err("width"))
        if qty is None or not 1 <= qty <= 100_000_000:
            errs.append(_err("qty"))
        if kind == "sheet" and (length is None or not 50 <= length <= 20000):
            errs.append(_err("length"))
        try:
            tol = Decimal(str(val.get("tol")).replace("%", "").strip()) if str(val.get("tol") or "").strip() else Decimal(0)
            if Decimal(0) < tol < Decimal(1) and isinstance(val.get("tol"), float):
                tol = tol * 100  # an Excel percentage cell (5% is 0.05)
            if not Decimal(0) <= tol <= Decimal(50):
                raise InvalidOperation
        except InvalidOperation:
            tol = Decimal(0)
            errs.append(_err("tolerance"))
        try:
            due = _date(val.get("due"))
        except ValueError:
            due = None
            errs.append(_err("date", value=str(val.get("due"))))
        g = None
        if str(val.get("grade") or "").strip():
            g = grades.get(_key(val.get("grade")))
            if g is None:
                errs.append(_err("grade", value=str(val.get("grade"))))
        u = None
        if str(val.get("unit") or "").strip():
            u = units.get(_key(val.get("unit")))
            if u is None:
                errs.append(_err("unit", value=str(val.get("unit"))))
            elif kind == "sheet" and u.kind != "sheeter":
                errs.append(_err("not_sheeter", value=u.code))
        if errs:
            errors.append({"row": rn, "errors": errs})
            continue
        assert width is not None and qty is not None
        rows.append({
            "row": rn, "cycle": cycle, "grade": g, "unit": u,
            "order": {"customer": (str(val.get("customer")).strip()[:120] or None) if val.get("customer") is not None else None,
                      "ref": (str(val.get("ref")).strip()[:60] or None) if val.get("ref") is not None else None,
                      "kind": kind, "width_mm": width, "sheet_length_mm": length if kind == "sheet" else None, "reels": qty,
                      "converter_id": u.id if u else None, "tolerance_pct": tol, "due_date": due},
        })  # fmt: skip
    if cols is None:
        raise ValueError("No header row: the file needs the columns Cycle, Width (mm) and Quantity (see the template)")
    plans = list(db.execute(select(CutPlan).where(CutPlan.machine_id == m.id).order_by(CutPlan.created_at.desc())).scalars())
    cycles: dict[str, dict[str, Any]] = {}
    for r in rows:
        cy = cycles.setdefault(r["cycle"].casefold(), {"title": r["cycle"], "rows": [], "grades": set()})
        cy["rows"].append(r)
        if r["grade"]:
            cy["grades"].add(r["grade"])
    out = []
    for cy in cycles.values():
        errs = []
        grade: OpGrade | None = None
        if len(cy["grades"]) > 1:
            errs.append(_err("grades", values=", ".join(sorted(g.code for g in cy["grades"]))))
        elif cy["grades"]:
            grade = next(iter(cy["grades"]))
        plan = next((p for p in plans if p.title.casefold() == cy["title"].casefold()), None)
        existing = len(plan.orders) if plan else 0
        if plan and plan.status == "released":
            errs.append(_err("released"))
        if plan and grade and plan.grade_id and plan.grade_id != grade.id:
            errs.append(_err("plan_grade", value=next((g.code for g in grades.values() if g.id == plan.grade_id), "")))
        if existing + len(cy["rows"]) > MAX_ORDERS:
            errs.append(_err("too_many", n=MAX_ORDERS))
        orders = [r["order"] for r in cy["rows"]]
        out.append({
            "title": cy["title"], "grade": grade, "plan": plan, "orders": orders, "errors": errs, "existing": existing,
        })  # fmt: skip
    return {"rows": len(rows) + len(errors), "errors": errors, "cycles": out}


def preview(p: dict[str, Any]) -> dict[str, Any]:
    cyc = [
        {
            "title": c["title"],
            "grade": c["grade"].code if c["grade"] else None,
            "action": "add" if c["plan"] else "new",
            "plan_id": str(c["plan"].id) if c["plan"] else None,
            "existing": c["existing"],
            "orders": len(c["orders"]),
            "reels": sum(o["reels"] for o in c["orders"] if o["kind"] == "reel"),
            "sheets": sum(o["reels"] for o in c["orders"] if o["kind"] == "sheet"),
            "errors": c["errors"],
        }
        for c in p["cycles"]
    ]
    invalid = len(p["errors"]) + sum(1 for c in cyc if c["errors"])
    return {"rows": p["rows"], "invalid": invalid, "errors": p["errors"][:200], "cycles": cyc}


def commit(db: Session, m: OpMachine, p: dict[str, Any], user_id: Any) -> dict[str, Any]:
    """Adds the orders (nothing when any error: the caller checks preview()["invalid"] first)."""
    created = added = 0
    ids = []
    for c in p["cycles"]:
        plan: CutPlan | None = c["plan"]
        if plan is None:
            plan = CutPlan(plant_id=m.plant_id, machine_id=m.id, grade_id=c["grade"].id if c["grade"] else None, title=c["title"],
                           status="draft", result={}, created_by_id=user_id)  # fmt: skip
            db.add(plan)
            db.flush()
            created += 1
        else:
            added += 1
            if c["grade"] and not plan.grade_id:
                plan.grade_id = c["grade"].id
            if plan.status == "calculated":  # new orders: the last result is out of date
                plan.status = "draft"
            plan.result = {}
            plan.calculated_at = None
        start = max((o.sort for o in plan.orders), default=-1) + 1
        for i, o in enumerate(c["orders"]):
            plan.orders.append(CutOrder(sort=start + i, **o))
        ids.append(str(plan.id))
    db.flush()
    return {"created": created, "added_to": added, "orders": sum(len(c["orders"]) for c in p["cycles"]), "plans": ids}
