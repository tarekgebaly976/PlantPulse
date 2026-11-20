# PlantPulse – Shutdowns

| Scene | Shown | Narration (one line per step) |
|---|---|---|
| 01-title | title | Shutdowns. A planned stop of a line or the whole plant, broken into work packages, scheduled on a Gantt chart with its critical path, and followed day by day until a safe restart. |
| 02-how | cards | A shutdown, step by step.<br>The shutdown has a name, a scope, and a planned start and end.<br>It is split into work packages, with duration, manpower, contractors and predecessors.<br>The critical path is calculated and shown in red; the rest has float.<br>The total duration is checked against the planned stop.<br>Readiness is followed for materials, permits and lock-out.<br>Progress is logged daily, with the reason for any delay.<br>Every pre-startup check must be done before the shutdown is completed.<br>And the report keeps the lessons learned. |
| 03-create | App (desktop) – 1 · Plan | The planner creates the shutdown.<br>With its code, name, scope and the planned window.<br>Then the work packages: first, isolate the line.<br>Each package has a duration, manpower, and the packages it must wait for. Three jobs in parallel, then the restart test, which waits for all three. |
| 04-gantt | App (desktop) – 2 · Critical path | The schedule is calculated at once. The critical path is drawn in red: any delay there delays the restart. The others show their float.<br>At the top: the total duration against the window, and whether it fits. |
| 05-readiness | App (desktop) – 3 · Readiness & progress | The packages list shows float, readiness and progress.<br>Each package is marked ready for materials, permits and lock-out.<br>And the readiness percentages at the top follow.<br>During the stop, progress is logged every day.<br>A delay always has a reason, and the package shows as delayed. |
| 06-checks | App (desktop) – 4 · Safe restart | Before the restart come the pre-startup and commissioning checks.<br>Add each check.<br>And confirm it with its result. The shutdown cannot be completed until every check is done.<br>The completion report keeps the lessons learned and the documents. A whole shutdown plan can also be imported from Excel. |
| 07-end | title | That is shutdowns. Next: root cause analysis, so a major breakdown does not happen twice. |

315 words, about 126 s of voice at a calm pace.

Own recordings: voice/shutdowns/<scene>.wav (e.g. voice/shutdowns/01-title.wav) replace the voice of that scene.
