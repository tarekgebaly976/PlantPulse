// Helpers shared by the video definitions.
"use strict";

/** Pick an option in a searchable Mantine Select by its label (same as the app's own end-to-end tests). */
async function pick(page, label, search, option) {
  const input = page.getByRole("combobox", { name: label, exact: true }).first();
  await input.click();
  await input.fill(search);
  await page.getByRole("option", { name: option ?? new RegExp(search) }).first().click();
}

/** Choose a value in a non-searchable Select. */
async function choose(page, label, option) {
  await page.getByRole("combobox", { name: label, exact: true }).first().click();
  await page.getByRole("option", { name: option, exact: true }).first().click();
}

/** Confirm a work order status change (button "Move to: …" opens a dialog). */
const confirm = (s) => async () => { await s.page.getByTestId("transition-confirm").click(); await s.settle(1000); };

const title = (id, t, sub, narration) => ({ id, layout: "title", title: t, subtitle: sub, narration });

module.exports = { pick, choose, confirm, title };
