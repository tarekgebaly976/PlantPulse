// Video 03 – Technicians on the phone: My work, Scan QR and the field round without internet.
"use strict";
const { confirm, title } = require("../_common");
const { BASE } = require("../../lib/capture");

const OFFLINE_WO = "Palletizer roller bearing noise"; // assigned to the demo technician, scheduled
const QR_ASSET = "L1-MIX-M1-DRV-GBX";

async function qrToken(s, code) {
  const me = await (await s.page.request.get(BASE + "/api/v1/auth/me")).json();
  const plant = me.plants[0].plant_id;
  const list = await (await s.page.request.get(`${BASE}/api/v1/assets?q=${code}`, { headers: { "X-Plant-Id": plant } })).json();
  return list.items.find((a) => a.code === code).qr_token;
}

module.exports = {
  id: "technicians",
  file: "03-technicians-on-the-phone",
  title: "PlantPulse – Technicians on the phone",
  covers: "My work on the phone, starting a job, Scan QR and the equipment page, the field round: prepare for offline, equipment card, work request and work order progress without internet, automatic sending when back online",
  keyframes: [["02-mywork", 0.5], ["04-prepare", 0.8], ["05-offline-request", 0.85], ["07-online", 0.8]],
  scenes: [
    title("01-title", "Technicians on the phone", "My work · Scan QR · Field round without internet",
      "This video is for technicians. Everything they need is on the phone: their jobs, the equipment behind every QR label, and a field round that keeps working without internet."),
    {
      id: "02-mywork", layout: "app", device: "phone", chapter: "My work", step: "1 · My work",
      narration: "PlantPulse can be installed on the phone's home screen, and opens on My work: the jobs assigned to you, soonest first. "
        + "A red shield marks jobs that need lock-out or a permit. Open a job, and the buttons at the bottom move it on, for example: start the work.",
      async capture(cap) {
        const s = await cap.login("tech1", "phone");
        const p = s.page;
        await s.click(p.getByTestId("bottom-nav").getByRole("link", { name: "My work" }), "My work: my jobs, soonest first");
        await s.click(p.getByTestId("my-wo-card").filter({ hasText: "Gearbox oil sample" }).first(), "Open a job");
        await s.click(p.getByTestId("to-in_progress"), "Start the work", { after: confirm(s) });
        await s.view("The job is in progress – the tabs hold checklist, hours and parts", { focus: p.getByTestId("wo-status"), zoom: 1 });
      },
    },
    {
      id: "03-scan", layout: "app", device: "phone", chapter: "Scan QR", step: "2 · Scan QR",
      narration: "Every machine has a QR label. Scan it with the phone's camera, and its page opens: where it sits in the plant, "
        + "its open and past work orders, spare parts and documents. A problem? Report it from right there.",
      async capture(cap) {
        const s = await cap.login("tech1", "phone");
        const p = s.page;
        const token = await qrToken(s, QR_ASSET);
        await s.click(p.getByTestId("bottom-nav").getByRole("link", { name: "Scan QR" }), "Scan QR: the camera reads the label");
        await s.type(p.getByTestId("qr-manual"), `cmms:asset:${token}`, "Or type the code under the label");
        await s.click(p.getByRole("button", { name: "Open" }), "The equipment page opens", { wait: 1500 });
        await s.quiet(async () => { await p.mouse.wheel(0, 500); });
        await s.view("History, spare parts, documents – and report a problem here");
      },
    },
    {
      id: "04-prepare", layout: "app", device: "phone", chapter: "Field round", step: "3 · Prepare",
      narration: "Some areas have no signal. The field round is made for that. Open it once while connected, and it prepares the phone by itself: "
        + "all equipment of your departments and your work orders are kept on the phone. Update refreshes them at any time.",
      async capture(cap) {
        const s = await cap.login("tech1", "phone");
        const p = s.page;
        await s.goto("/field");
        await s.quiet(async () => { await p.getByText(/equipment ready offline/).waitFor({ timeout: 30000 }); });
        await s.view("…equipment and my work orders are now on the phone", { focus: p.getByText(/equipment ready offline/), zoom: 1, weight: 1.2 });
        await s.click(p.getByTestId("field-update"), "Update refreshes them", { wait: 3000 });
        cap.keep = s; // the same phone continues in the next scenes
      },
    },
    {
      id: "05-offline-request", layout: "app", device: "phone", chapter: "Field round", step: "4 · No signal",
      narration: "Now the signal is gone. The badge turns red, and the round still works. Search or scan the equipment: its card shows "
        + "the last work orders. Write a work request, tick Breakdown, and save it on the phone. "
        + "For a stopped machine, the app reminds you to call or use the radio as well.",
      async capture(cap) {
        const s = cap.keep;
        const p = s.page;
        await s.quiet(async () => { await s.ctx.setOffline(true); });
        await s.view("Offline: the badge turns red", { focus: p.getByTestId("field-net"), zoom: 1, weight: 0.9 });
        await s.type(p.getByTestId("field-search"), "palletizer", "Search or scan the equipment");
        await s.click(p.getByText("L3-PAL").first(), "The equipment card, with its last work orders");
        await s.click(p.getByTestId("field-new-request"), "New work request");
        const dlg = p.getByRole("dialog");
        await s.quiet(async () => {
          const t = dlg.getByRole("textbox", { name: /^Title/ });
          if (!(await t.inputValue())) await t.fill("Roller bearing noisy, guard hot");
        });
        await s.click(dlg.getByLabel("Breakdown (machine stopped)"), "Breakdown – and call the supervisor too", { check: true });
        await s.click(p.getByTestId("field-save"), "Saved on the phone, waiting to be sent");
      },
    },
    {
      id: "06-offline-wo", layout: "app", device: "phone", chapter: "Field round", step: "5 · Work offline",
      narration: "Your own work orders work offline too. Open one, start it, book your hours, add the parts you fitted and write your findings. "
        + "Then send it for review. Everything waits on the phone. Approvals, the lock-out and permit sign-off, and closing jobs still need a connection.",
      async capture(cap) {
        const s = cap.keep;
        const p = s.page;
        await s.click(p.getByTestId("field-tabs").getByText(/My work orders/), "My work orders – on the phone");
        await s.click(p.getByTestId("fwo-item").filter({ hasText: OFFLINE_WO }).first(), "Open the job");
        await s.click(p.getByTestId("fwo-start"), "Start work – without internet");
        await s.quiet(async () => { await p.getByTestId("fwo-hours").fill("1.5"); });
        await s.click(p.getByTestId("fwo-add-hours"), "Book the hours");
        await s.quiet(async () => { await p.getByTestId("fwo-part-text").fill("Roller bearing 6205"); });
        await s.click(p.getByTestId("fwo-add-part"), "Parts fitted");
        await s.type(p.getByTestId("fwo-findings"), "Bearing dry and noisy, replaced", "Findings");
        await s.quiet(async () => { await p.getByTestId("fwo-findings").blur(); });
        await s.click(p.getByTestId("fwo-submit"), "Send for review – it waits on the phone");
      },
    },
    {
      id: "07-online", layout: "app", device: "phone", chapter: "Field round", step: "6 · Back online",
      narration: "As soon as the phone is back online, everything is sent by itself. The request gets its number, and the work order update reaches the supervisor. "
        + "Each item is sent only once, and the time it was written on the phone is kept.",
      async capture(cap) {
        const s = cap.keep;
        const p = s.page;
        await s.quiet(async () => {
          await p.getByRole("button", { name: "Close" }).last().click().catch(() => {});
          await p.waitForTimeout(500);
        });
        await s.view("Waiting on this phone", { focus: p.getByTestId("field-outbox"), zoom: 1 });
        await s.quiet(async () => {
          await s.ctx.setOffline(false);
          await p.getByTestId("field-outbox").getByText(/WR-/).first().waitFor({ timeout: 40000 });
          await p.waitForTimeout(3000);
        });
        await s.view("Online again: sent – the request has its number", { focus: p.getByTestId("field-outbox"), zoom: 1, weight: 1.3 });
      },
    },
    title("08-end", "Technicians on the phone", "Next: preventive maintenance",
      "That is the technician's day on the phone. Next: preventive maintenance, and how planned work is created by itself."),
  ],
};

// ---- Voice, one sentence per filmed step ----
require("../_common").applySays(module.exports, {
  "02-mywork": ["PlantPulse installs on the phone's home screen and opens on My work: your jobs, soonest first. A red shield marks jobs that need lock-out or a permit.",
    "Open a job.", "The buttons at the bottom move it on: start the work.", "The job is in progress. Its tabs hold the checklist, hours and parts."],
  "03-scan": ["Every machine has a QR label. Scan QR uses the phone's camera.", "Or type the code printed under the label.",
    "The equipment page opens.", "Its history, spare parts and documents, and a button to report a problem."],
  "04-prepare": ["Some areas have no signal, and the field round is made for that. Open it once while connected: all equipment of your departments and your work orders are kept on the phone.",
    "Update refreshes them at any time."],
  "05-offline-request": ["Now the signal is gone. The badge turns red, and the round still works.", "Search, or scan, the equipment.",
    "Its card shows the last work orders, as downloaded.", "Write a new work request.",
    "Tick Breakdown. For a stopped machine the app reminds you to call or use the radio as well.",
    "It is saved on the phone, waiting to be sent."],
  "06-offline-wo": ["Your own work orders work offline too.", "Open one.", "Start the work, without internet.", "Book your hours.",
    "Add the parts you fitted.", "Write your findings.",
    "And send it for review. It waits on the phone. Approvals, lock-out sign-off and closing still need a connection."],
  "07-online": ["Two items are waiting on this phone.",
    "As soon as the phone is back online, they are sent by themselves. The request gets its number, each item is sent only once, and the time it was written is kept."],
});
