"""Demo sample data for the operations daily logs (plant DPM): a utilities daily generation & electricity log and a
stock preparation shift log, with about 30 days of invented values, running-hour meters on the equipment and a few open
work requests of stock preparation. Called by app.demo_operations.build."""

import random
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.assets import Asset, Meter, MeterReading
from app.models.enums import AssetLevel, Criticality, OpReportStatus
from app.models.operations import OpDailyReport, OpLog, OpLogField, OpLogTemplate, OpLogValue, OpReel
from app.models.tenancy import Plant
from app.models.workorders import WorkRequest
from app.services.assets import compute_path, new_qr_token
from app.services.common import next_number

# code, section, label, kind, unit, decimals, formula, low, high, chart, per_ton, meter asset
UT_FIELDS = [
    ("RAW_IN", "Water & RO", "Raw water intake", "meter", "m³", 0, None, None, None, True, False, None),
    ("RO1", "Water & RO", "RO plant 1 product", "meter", "m³", 0, None, None, None, False, False, None),
    ("RO2", "Water & RO", "RO plant 2 product", "meter", "m³", 0, None, None, None, False, False, None),
    ("RO_FEED", "Water & RO", "Feed water to RO", "meter", "m³", 0, None, None, None, False, False, None),
    ("RO_REC", "Water & RO", "RO recovery", "calc", "%", 1, "(RO1 + RO2) / RO_FEED * 100", 65, None, True, False, None),
    ("FW_PM", "Water & RO", "Fresh water – paper machine", "meter", "m³", 0, None, None, None, False, True, None),
    ("FW_SP", "Water & RO", "Fresh water – stock preparation", "meter", "m³", 0, None, None, None, False, False, None),
    ("FW_UT", "Water & RO", "Fresh water – utilities & boiler", "meter", "m³", 0, None, None, None, False, False, None),
    ("FW_TOTAL", "Water & RO", "Fresh water – total", "calc", "m³", 0, "FW_PM + FW_SP + FW_UT", None, None, True, True, None),
    ("TANK", "Water & RO", "Product water tank level", "number", "%", 0, None, 30, 95, False, False, None),
    ("EFF_IN", "WWTP", "Effluent inlet", "meter", "m³", 0, None, None, None, True, True, None),
    ("EFF", "WWTP", "Treated effluent outlet", "meter", "m³", 0, None, None, None, False, False, None),
    ("PH_IN", "WWTP", "pH inlet", "number", "pH", 1, None, 6, 9, False, False, None),
    ("PH_OUT", "WWTP", "pH outlet", "number", "pH", 1, None, 6.5, 8.5, True, False, None),
    ("COD_IN", "WWTP", "COD inlet", "number", "mg/L", 0, None, None, None, False, False, None),
    ("COD_OUT", "WWTP", "COD outlet", "number", "mg/L", 0, None, None, 200, True, False, None),
    ("COD_RED", "WWTP", "COD removal", "calc", "%", 1, "(COD_IN - COD_OUT) / COD_IN * 100", 85, None, True, False, None),
    ("TSS_OUT", "WWTP", "TSS outlet", "number", "mg/L", 0, None, None, 50, False, False, None),
    ("SLUDGE", "WWTP", "Sludge dewatered", "number", "t", 1, None, None, None, False, False, None),
    ("GE1_H", "Power house", "Gas engine 1 running hours", "counter", "h", 1, None, None, None, False, False, "UT-GE1"),
    ("GE1_MWH", "Power house", "Gas engine 1 generated", "number", "MWh", 1, None, None, None, False, False, None),
    ("GE1_FS", "Power house", "Gas engine 1 forced stoppage", "number", "h", 1, None, None, 2, False, False, None),
    ("GE2_H", "Power house", "Gas engine 2 running hours", "counter", "h", 1, None, None, None, False, False, "UT-GE2"),
    ("GE2_MWH", "Power house", "Gas engine 2 generated", "number", "MWh", 1, None, None, None, False, False, None),
    ("GE2_FS", "Power house", "Gas engine 2 forced stoppage", "number", "h", 1, None, None, 2, False, False, None),
    ("GEN", "Power house", "Total generated", "calc", "MWh", 1, "GE1_MWH + GE2_MWH", None, None, True, False, None),
    ("GRID", "Power house", "Imported from the grid", "number", "MWh", 1, None, None, None, True, False, None),
    ("P_PM", "Power consumption", "Paper machine", "number", "MWh", 1, None, None, None, False, True, None),
    ("P_SP", "Power consumption", "Stock preparation", "number", "MWh", 1, None, None, None, False, False, None),
    ("P_BH", "Power consumption", "Boiler house", "number", "MWh", 1, None, None, None, False, False, None),
    ("P_UT", "Power consumption", "Utilities, WWTP & water treatment", "number", "MWh", 1, None, None, None, False, False, None),
    ("P_FH", "Power consumption", "Finishing house", "number", "MWh", 1, None, None, None, False, False, None),
    ("P_OF", "Power consumption", "Offices & workshop", "number", "MWh", 1, None, None, None, False, False, None),
    (
        "P_TOTAL",
        "Power consumption",
        "Total consumed",
        "calc",
        "MWh",
        1,
        "P_PM + P_SP + P_BH + P_UT + P_FH + P_OF",
        None,
        None,
        True,
        True,
        None,
    ),
    (
        "P_BAL",
        "Power consumption",
        "Balance (generated + imported − consumed)",
        "calc",
        "MWh",
        1,
        "GEN + GRID - P_TOTAL",
        -5,
        5,
        False,
        False,
        None,
    ),
    ("STEAM", "Boiler house", "Steam generated", "number", "t", 0, None, None, None, True, True, None),
    ("COND", "Boiler house", "Condensate returned", "number", "t", 0, None, None, None, False, False, None),
    ("COND_PCT", "Boiler house", "Condensate recovery", "calc", "%", 1, "COND / STEAM * 100", 60, None, True, False, None),
    ("FEED_W", "Boiler house", "Boiler feed water", "number", "m³", 0, None, None, None, False, False, None),
    ("BLR1_H", "Boiler house", "Boiler 1 running hours", "counter", "h", 1, None, None, None, False, False, "UT-BLR1"),
    ("AIR", "Compressed air", "Compressed air produced", "number", "Nm³", 0, None, None, None, True, False, None),
    ("DEW", "Compressed air", "Dryer dew point", "number", "°C", 1, None, None, 3, False, False, None),
    ("AC1_H", "Compressed air", "Air compressor 1 running hours", "counter", "h", 1, None, None, None, False, False, "UT-AC1"),
    ("AC2_H", "Compressed air", "Air compressor 2 running hours", "counter", "h", 1, None, None, None, False, False, "UT-AC2"),
    ("GAS", "Natural gas", "Natural gas – total", "meter", "Nm³", 0, None, None, None, True, True, None),
    ("GAS_GE", "Natural gas", "Natural gas – to gas engines", "meter", "Nm³", 0, None, None, None, False, False, None),
    ("GAS_BLR", "Natural gas", "Natural gas – to boilers", "calc", "Nm³", 0, "GAS - GAS_GE", None, None, True, False, None),
]
SP_FIELDS = [
    ("CIL", "Shift", "CIL (clean, inspect, lubricate) done", "check", None, 0, None, 1, None, False, False, None),
    ("S5", "Shift", "5S activity", "text", None, 0, None, None, None, False, False, None),
    ("OPNOTE", "Shift", "Operation notes (stock off / on)", "text", None, 0, None, None, None, False, False, None),
    ("BROKE", "Broke", "Broke flow to SP", "number", "L/min", 0, None, None, 5000, True, False, None),
    ("B_OCC", "Furnish (bales)", "Line 1 – OCC", "number", "bales", 0, None, None, None, True, False, None),
    ("B_MW", "Furnish (bales)", "Line 2 – mixed waste", "number", "bales", 0, None, None, None, False, False, None),
    ("B_ONP", "Furnish (bales)", "Line 3 – newsprint", "number", "bales", 0, None, None, None, False, False, None),
    ("B_HW", "Furnish (bales)", "Virgin pulp – hardwood", "number", "bales", 0, None, None, None, False, False, None),
    ("B_SW", "Furnish (bales)", "Virgin pulp – softwood", "number", "bales", 0, None, None, None, False, False, None),
    ("B_TOTAL", "Furnish (bales)", "Total bales", "calc", "bales", 0, "B_OCC + B_MW + B_ONP + B_HW + B_SW", None, None, True, True, None),
    ("T_DUMP1", "Stock levels", "Dump tank 1", "number", "%", 0, None, 20, 90, True, False, None),
    ("T_DUMP2", "Stock levels", "Dump tank 2", "number", "%", 0, None, 20, 90, False, False, None),
    ("T_STORE1", "Stock levels", "Storage tank 1", "number", "%", 0, None, 20, 90, False, False, None),
    ("T_STORE2", "Stock levels", "Storage tank 2", "number", "%", 0, None, 20, 90, False, False, None),
    ("FL1", "Forklifts", "Forklift 1 in service", "check", None, 0, None, 1, None, False, False, None),
    ("FL2", "Forklifts", "Forklift 2 in service", "check", None, 0, None, 1, None, False, False, None),
]
EQUIPMENT = [  # code, name, department, running-hours meter
    ("UT-GE1", "Gas engine 1", "UTIL", True),
    ("UT-GE2", "Gas engine 2", "UTIL", True),
    ("UT-AC1", "Air compressor 1", "UTIL", True),
    ("UT-AC2", "Air compressor 2", "UTIL", True),
    ("UT-BLR1", "Boiler 1", "UTIL", True),
    ("SP-PULPER", "Pulper line 1", "SP", False),
    ("SP-SCREEN", "Fine screen line 1", "SP", False),
    ("SP-DISC", "Disc filter", "SP", False),
]
SP_ISSUES = [  # asset, title, breakdown
    ("SP-PULPER", "[Shutdown] Pulper rotor worn, temporary repair; replace at next stop", False),
    ("SP-SCREEN", "Screen sealing water flow low, check valve", False),
    ("SP-DISC", "[Shutdown] Two disc filter segments damaged, spares needed", False),
]
TEXTS_5S = ["Floor cleaning around pulper", "Cleaning of screen room", "Tidying spare parts corner", "Cleaning of tank platform", ""]


def _template(
    db: Session, plant: Plant, code: str, name: str, dept_id, freq: str, issues: bool, sort: int, rows: list, meters: dict, line_id=None
) -> tuple:
    t = OpLogTemplate(
        plant_id=plant.id, code=code, name=name, department_id=dept_id, frequency=freq, day_start=time(7, 0), issues=issues, sort=sort, incidents=True,
        machine_id=line_id,  # both forms belong to PM1: "per tonne" is per tonne of PM1's paper
        shifts=[{"code": "D", "name": "Day shift", "start": "07:00"}, {"code": "N", "name": "Night shift", "start": "19:00"}] if freq == "shift" else [],
    )  # fmt: skip
    db.add(t)
    db.flush()
    fields = {}
    for i, (c, sec, label, kind, unit, dec, formula, low, high, chart, per_ton, meter) in enumerate(rows):
        x = OpLogField(
            day_agg="sum" if unit == "bales" else None,
            template_id=t.id, section=sec, code=c, label=label, kind=kind, unit=unit, decimals=dec, formula=formula,
            low=Decimal(str(low)) if low is not None else None, high=Decimal(str(high)) if high is not None else None,
            meter_id=meters[meter].id if meter else None, chart=chart, per_ton=per_ton, sort=(i + 1) * 10,
        )  # fmt: skip
        db.add(x)
        fields[c] = x
    db.flush()
    return t, fields


def _put(db: Session, log: OpLog, fields: dict, vals: dict) -> None:
    for code, v in vals.items():
        fl = fields[code]
        if fl.kind in ("meter", "counter"):
            o, c = v
            db.add(
                OpLogValue(
                    log_id=log.id,
                    field_id=fl.id,
                    opening=Decimal(str(round(o, 1))),
                    closing=Decimal(str(round(c, 1))) if c is not None else None,
                )
            )
        elif fl.kind == "text":
            db.add(OpLogValue(log_id=log.id, field_id=fl.id, text=v or None))
        else:
            db.add(OpLogValue(log_id=log.id, field_id=fl.id, value=Decimal(str(round(v, 2)))))


def _status(log: OpLog, i: int, end: datetime, users: dict) -> None:
    """Older logs confirmed, yesterday's submitted, the one in progress left as a draft."""
    if i == 0:
        return
    log.status = OpReportStatus.SUBMITTED
    log.submitted_by_id, log.submitted_at = users["prod.sup"].id, end + timedelta(minutes=30)
    if i >= 2:
        log.status = OpReportStatus.CONFIRMED
        log.confirmed_by_id, log.confirmed_at = users["prod.mgr"].id, end + timedelta(hours=3)


def build_logs(db: Session, plant: Plant, ref: dict, current: date, now: datetime, days: int = 30) -> int:
    rnd = random.Random(20261117)
    tz = ZoneInfo(plant.timezone)
    depts, users = ref["depts"], ref["users"]
    assets: dict[str, Asset] = {}
    meters: dict[str, Meter] = {}
    for code, name, dept, has_meter in EQUIPMENT:
        a = Asset(
            plant_id=plant.id, department_id=depts[dept].id, level=AssetLevel.PRODUCTION_LINE, code=code, name=name, criticality=Criticality.B,
            qr_token=new_qr_token(), install_date=date(2016, 3, 1), location=f"{dept} area",
        )  # fmt: skip
        db.add(a)
        db.flush()
        a.path = compute_path(None, a.id)
        assets[code] = a
        if has_meter:
            m = Meter(plant_id=plant.id, asset_id=a.id, name="Running hours", unit="h", is_operating_hours=True, current_value=Decimal(0))
            db.add(m)
            meters[code] = m
    db.flush()
    for acode, title, bd in SP_ISSUES:
        db.add(WorkRequest(plant_id=plant.id, number=next_number(db, plant, "WR"), asset_id=assets[acode].id, title=title,
                           description="Raised from the stock preparation shift log (sample).", is_breakdown=bd, created_by_id=users["prod.sup"].id))  # fmt: skip
    ut, utf = _template(
        db, plant, "UT-DAILY", "Utilities daily report", depts["UTIL"].id, "day", False, 10, UT_FIELDS, meters, ref.get("machine_id")
    )
    sp, spf = _template(
        db,
        plant,
        "SP-SHIFT",
        "Stock preparation – shift report",
        depts["SP"].id,
        "shift",
        True,
        20,
        SP_FIELDS,
        meters,
        ref.get("machine_id"),
    )
    sp.in_pm_report = True  # shown inside the PM & SP daily report

    net_by_day: dict[date, float] = {}
    for r in db.execute(select(OpDailyReport).where(OpDailyReport.plant_id == plant.id)).scalars():
        net_by_day[r.report_date] = sum(
            float(x.net_mt + x.reject_mt) for x in db.execute(select(OpReel).where(OpReel.report_id == r.id)).scalars()
        )

    rd = {"RAW_IN": 2_431_000.0, "RO1": 182_000.0, "RO2": 585_000.0, "RO_FEED": 1_210_000.0, "FW_PM": 1_390_000.0, "FW_SP": 1_501_000.0,
          "FW_UT": 1_396_000.0, "EFF_IN": 571_000.0, "EFF": 545_000.0, "GAS": 961_000.0, "GAS_GE": 512_000.0,
          "GE1_H": 41_250.0, "GE2_H": 38_910.0, "AC1_H": 144_200.0, "AC2_H": 30_300.0, "BLR1_H": 61_480.0}  # fmt: skip
    n = 0
    for i in range(days, -1, -1):
        d = current - timedelta(days=i)
        t0 = datetime.combine(d, time(7, 0), tzinfo=tz)
        t1 = t0 + timedelta(days=1)
        net = net_by_day.get(d) or rnd.uniform(380, 520)
        # ---------------- utilities, daily
        lg = OpLog(plant_id=plant.id, template_id=ut.id, log_date=d, shift="-", created_by_id=users["prod.sup"].id)
        db.add(lg)
        db.flush()
        if i == 0:  # in progress: openings only, as the next morning's form starts
            _put(db, lg, utf, {c: (rd[c], None) for c, f in utf.items() if f.kind in ("meter", "counter")})
        else:
            fw_pm = net * rnd.uniform(6.5, 8.0)
            fw_sp = net * rnd.uniform(4.0, 5.0)
            fw_ut = rnd.uniform(1100, 1500)
            ro_feed = rnd.uniform(2500, 2900)
            ro1, ro2 = ro_feed * rnd.uniform(0.32, 0.36), ro_feed * rnd.uniform(0.33, 0.37)
            steam = net * rnd.uniform(1.85, 2.2)
            ge_fs = [0.0 if rnd.random() < 0.85 else round(rnd.uniform(0.5, 4), 1) for _ in range(2)]
            ge_h = [24 - ge_fs[0], 24 - ge_fs[1]]
            ge_mwh = [h * rnd.uniform(2.3, 2.5) for h in ge_h]
            p = {"P_PM": net * rnd.uniform(0.27, 0.31), "P_SP": net * rnd.uniform(0.14, 0.17), "P_BH": rnd.uniform(18, 26), "P_UT": rnd.uniform(14, 20),
                 "P_FH": rnd.uniform(6, 10), "P_OF": rnd.uniform(3, 5)}  # fmt: skip
            grid = sum(p.values()) - sum(ge_mwh) + rnd.uniform(-1.5, 1.5)
            eff_in = rnd.uniform(3500, 4300)
            gas_ge = sum(ge_mwh) * rnd.uniform(225, 235)
            cod_in = rnd.uniform(1800, 2600)
            cod_out = rnd.uniform(90, 180) if rnd.random() > 0.06 else rnd.uniform(210, 260)
            inc = {"RAW_IN": fw_pm + fw_sp + fw_ut + rnd.uniform(300, 600), "RO1": ro1, "RO2": ro2, "RO_FEED": ro_feed, "FW_PM": fw_pm, "FW_SP": fw_sp,
                   "FW_UT": fw_ut, "EFF_IN": eff_in, "EFF": eff_in * rnd.uniform(0.95, 0.99), "GAS": steam * rnd.uniform(75, 85) + gas_ge, "GAS_GE": gas_ge,
                   "GE1_H": ge_h[0], "GE2_H": ge_h[1], "AC1_H": 24, "AC2_H": rnd.choice([0, 12, 24, 24]), "BLR1_H": rnd.choice([24, 24, 23, 22])}  # fmt: skip
            vals: dict = {}
            for c, add in inc.items():
                vals[c] = (rd[c], rd[c] + add)
                rd[c] += add
            vals.update({"TANK": rnd.uniform(45, 92), "STEAM": steam, "COND": steam * rnd.uniform(0.55, 0.8), "AIR": rnd.uniform(160_000, 180_000),
                         "GE1_MWH": ge_mwh[0], "GE2_MWH": ge_mwh[1], "GE1_FS": ge_fs[0], "GE2_FS": ge_fs[1], "GRID": max(grid, 0), **p,
                         "PH_IN": rnd.uniform(6.6, 8.4), "PH_OUT": rnd.uniform(7.0, 8.1) if rnd.random() > 0.05 else 8.7, "COD_IN": cod_in, "COD_OUT": cod_out,
                         "TSS_OUT": rnd.uniform(15, 45), "SLUDGE": rnd.uniform(8, 14), "FEED_W": steam * rnd.uniform(1.03, 1.08), "DEW": rnd.uniform(1.0, 3.4)})  # fmt: skip
            _put(db, lg, utf, vals)
        _status(lg, i, t1, users)
        n += 1
        # ---------------- stock preparation, per shift
        for code, start in (("D", t0), ("N", t0 + timedelta(hours=12))):
            if start > now:
                continue
            end = start + timedelta(hours=12)
            running = end > now
            lg = OpLog(plant_id=plant.id, template_id=sp.id, log_date=d, shift=code, created_by_id=users["prod.sup"].id)
            db.add(lg)
            db.flush()
            half = net / 2
            vals = {"CIL": 1 if rnd.random() > 0.1 else 0, "S5": rnd.choice(TEXTS_5S),
                    "OPNOTE": rnd.choice(["", "", "", "Stock off 30 min for screen basket change"]),
                    "BROKE": rnd.uniform(2500, 4800), "B_OCC": round(half * rnd.uniform(0.28, 0.34)),
                    "B_MW": round(half * rnd.uniform(0.06, 0.1)), "B_ONP": round(half * rnd.uniform(0.02, 0.05)), "B_HW": round(half * rnd.uniform(0.04, 0.07)),
                    "B_SW": round(half * rnd.uniform(0.04, 0.07)), "T_DUMP1": rnd.uniform(35, 92), "T_DUMP2": rnd.uniform(40, 85),
                    "T_STORE1": rnd.uniform(40, 88), "T_STORE2": rnd.uniform(25, 80), "FL1": 1, "FL2": 1 if rnd.random() > 0.15 else 0}  # fmt: skip
            if running:
                vals = {k: vals[k] for k in ("T_DUMP1", "T_DUMP2", "T_STORE1", "T_STORE2", "FL1", "FL2")}
            _put(db, lg, spf, vals)
            _status(lg, 0 if running else (2 if end < now - timedelta(hours=14) else 1), end, users)
            n += 1
    # equipment meters: the readings of the confirmed utilities logs (meter-based PM sees the running hours)
    for code, m in meters.items():
        fid = next(f for f in utf.values() if f.meter_id == m.id).id
        last = db.execute(
            select(OpLogValue.closing, OpLog.log_date).join(OpLog, OpLog.id == OpLogValue.log_id)
            .where(OpLogValue.field_id == fid, OpLog.status == OpReportStatus.CONFIRMED, OpLogValue.closing.is_not(None))
            .order_by(OpLog.log_date.desc()).limit(1)
        ).first()  # fmt: skip
        if last:
            at = datetime.combine(last[1] + timedelta(days=1), time(7, 0), tzinfo=tz)
            value = Decimal(str(last[0]))
            m.current_value, m.last_read_at = value, at
            assets[code].operating_hours = value
            db.add(MeterReading(meter_id=m.id, value=value, read_at=at, recorded_by_id=users["prod.mgr"].id, source="operations"))
    db.flush()
    return n
