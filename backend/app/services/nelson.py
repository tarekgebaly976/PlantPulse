"""Nelson rules on an individuals (XmR) control chart, as on the plant's control-chart sheet.

Centre line (CL) = mean; sigma = average moving range / 1.128. Rules (pattern -> probable cause):
  1  1 point more than 3 sigma from CL                          new person, wrong setup
  2  7 points in a row on the same side of CL                   setup change, process change
  3  7 points in a row all increasing or all decreasing         trend, tool wear
  4  14 points in a row alternating up and down                 over-control, tampering
  5  2 of 3 points more than 2 sigma from CL (same side)        new person, wrong setup
  6  4 of 5 points more than 1 sigma from CL (same side)        small shift (like rules 1 and 5)
  7  14 points in a row within 1 sigma of CL (either side)      process change
  8  8 points in a row more than 1 sigma from CL (either side)  process change
The frontend (src/lib/kpiStatus.ts) applies the same rules for the charts; keep both in step."""

from dataclasses import dataclass, field

MIN_POINTS = 3


@dataclass
class Result:
    mean: float | None = None
    sigma: float | None = None
    triggers: list[list[int]] = field(default_factory=list)  # per point: rules whose pattern ends at that point
    rules: list[int] = field(default_factory=list)  # every rule broken somewhere


def nelson(x: list[float]) -> Result:
    n = len(x)
    r = Result(triggers=[[] for _ in x])
    if n < MIN_POINTS:
        return r
    mean = sum(x) / n
    sigma = sum(abs(x[i] - x[i - 1]) for i in range(1, n)) / (n - 1) / 1.128
    r.mean, r.sigma = mean, sigma
    if sigma == 0:
        return r
    z = [(v - mean) / sigma for v in x]

    def step(j: int) -> int:
        d = x[j] - x[j - 1]
        return (d > 0) - (d < 0)

    for i in range(n):
        hit: list[int] = []
        if abs(z[i]) > 3:
            hit.append(1)
        if i >= 6 and z[i] != 0 and all((z[j] > 0) == (z[i] > 0) and z[j] != 0 for j in range(i - 6, i + 1)):
            hit.append(2)
        if i >= 6:
            d = [step(j) for j in range(i - 5, i + 1)]
            if all(v > 0 for v in d) or all(v < 0 for v in d):
                hit.append(3)
        if i >= 13:
            d = [step(j) for j in range(i - 12, i + 1)]
            if all(v != 0 for v in d) and all(d[k] == -d[k - 1] for k in range(1, len(d))):
                hit.append(4)
        for rule, size, need, lim in ((5, 3, 2, 2), (6, 5, 4, 1)):
            if i >= size - 1:
                for s in (1, -1):
                    w = [j for j in range(i - size + 1, i + 1) if z[j] * s > lim]
                    if len(w) >= need and i in w:
                        hit.append(rule)
                        break
        if i >= 13 and all(abs(z[j]) < 1 for j in range(i - 13, i + 1)):
            hit.append(7)
        if i >= 7 and all(abs(z[j]) > 1 for j in range(i - 7, i + 1)):
            hit.append(8)
        r.triggers[i] = hit
    r.rules = sorted({k for t in r.triggers for k in t})
    return r
