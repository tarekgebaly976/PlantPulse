# PlantPulse – Weekly maintenance schedule

| Scene | Shown | Narration (one line per step) |
|---|---|---|
| 01-title | title | The weekly maintenance schedule. Who does which job, on which day, proposed in seconds and approved in two steps. |
| 02-how | cards | How the schedule is made.<br>It starts from the open work orders that are approved.<br>The roster says who is at work each day.<br>Each job must match the trade, the required skills, valid certificates, and a supervisor or engineer on shift for LOTO and permits.<br>Work that needs the line stopped goes only into a stop window.<br>The optimiser proposes the week, by priority and due date.<br>What does not fit is deferred, with the reason.<br>The engineer approves first.<br>And the manager's final approval writes the assignees and planned dates. |
| 03-week | App (desktop) – 1 · The week | The maintenance schedule is in the Maintenance menu.<br>A plan is a week, Sunday to Saturday, by default. The planner works on next week.<br>Three steps: the proposal, the engineer's approval, and the manager's final approval.<br>Line stop windows are the times production has agreed to stop a line. Work that needs the line stopped is only placed inside one.<br>The grid is the roster of the week: who is at work each day, on which shift, and who is on leave or on overtime. |
| 04-propose | App (desktop) – 2 · Proposal | Press Propose schedule. The optimiser, built on Google's OR-Tools, places the approved work in about a second.<br>The result: work orders scheduled, planned hours, deferred work, overtime and warnings.<br>Each job sits on a person and a day, coloured by priority, within the hours of the shift, and matching trade, skills and certificates.<br>What does not fit is deferred, and each one says why: an expired certificate, no stop window long enough, longer than a shift, or no estimated hours. |
| 05-edit | App (desktop) – 3 · Edit by hand | The planner can still change it by hand. Click a job.<br>Choose another day or another person. The change is pinned: it stays when the week is proposed again, and any rule it breaks shows as a warning.<br>Saved.<br>A deferred job can be placed by hand too.<br>Choose the day and the technician.<br>It is now in the plan. |
| 06-engineer | App (desktop) – 4 · Engineer | Next, the engineer reviews the proposal.<br>And approves it, or sends it back with a comment.<br>The week now waits for the maintenance manager. |
| 07-manager | App (desktop) – 5 · Manager | The maintenance manager gives the final approval.<br>The week is approved and locked. Only the manager can reopen it. |
| 08-wo | App (desktop) – 6 · Work orders | The final approval writes the plan into the work orders.<br>Each one now has its planned start and end.<br>And the technician it was given to, who sees it in My work. |
| 09-end | title | That is the weekly maintenance schedule. Next: the cutting plan. |

421 words, about 168 s of voice at a calm pace.

Own recordings: voice/schedule/<scene>.wav (e.g. voice/schedule/01-title.wav) replace the voice of that scene.
