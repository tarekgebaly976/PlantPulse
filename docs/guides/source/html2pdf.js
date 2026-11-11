// Prints an HTML file to an A4 PDF with Chromium (Playwright): node html2pdf.js in.html out.pdf "footer text"
// Used for the Arabic guides (Chromium shapes Arabic and lays out right to left).
const { chromium } = require("playwright");

(async () => {
  const [src, out, footer] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("file://" + src, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  await page.pdf({
    path: out,
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate: `<div dir="rtl" style="width:100%;font-family:'DejaVu Sans',sans-serif;font-size:8px;color:#44535A;padding:0 18mm;display:flex;justify-content:space-between;border-top:0.5px solid #D5DDDF;padding-top:3px;margin:0 18mm">
      <span>${esc(footer || "")}</span><span>صفحة <span class="pageNumber"></span> من <span class="totalPages"></span></span></div>`,
    margin: { top: "18mm", bottom: "20mm", left: "18mm", right: "18mm" },
  });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
