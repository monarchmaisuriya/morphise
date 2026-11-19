import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { htmlPage, themeCss } from "./page";

// Supply an existing Playwright installation explicitly; this optional test installs nothing.
const enabled = process.env.MORPHISE_BROWSER_TESTS === "1" && !!process.env.PLAYWRIGHT_MODULE;

// Each case uses the real shared document and helpers. No network or server/production data.
const content = `<title>pending</title>
<style>.custom{gap:28px}.positioned{position:relative;height:32px}.positioned p{position:absolute;top:4px;left:8px}</style>
<main class="report" id="report">
  <div class="grid"><div class="stat"><span class="label">Active contributors</span><span class="value">12</span></div><div class="stat"><span class="label">Changes this week</span><span class="value">84</span></div></div>
  <section class="report-section" id="section">
    <header class="report-heading" id="heading"><h2>Contributions by person</h2><p class="muted">A longer translated description keeps its title close while wrapping naturally on smaller screens.</p></header>
    <div class="report-data" id="data"><div id="chart"></div><div id="support"><table class="sortable" data-filter="Find contributor"><thead><tr><th>Person</th><th class="num">Changes</th></tr></thead><tbody><tr><td>River</td><td class="num">12</td></tr><tr><td>Alex</td><td class="num">24</td></tr></tbody></table></div></div>
  </section>
  <section class="report-section" id="next"><header class="report-heading"><h2>Daily activity</h2><p class="muted">Separate questions have a larger interval than their supporting text.</p></header><div id="daily"></div></section>
  <div id="donut"></div>
</main>
<div id="legacy" class="stack"><h2>Legacy stack</h2><p>Unchanged spacing</p><div id="legacy-chart"></div></div>
<div id="plain"><h2>Plain heading</h2><p>Plain text</p></div>
<div class="report-heading custom" id="custom"><h2>Author spacing</h2><p>Still authoritative</p></div>
<div class="positioned"><p id="positioned">Positioned text</p></div>
<div class="report" id="empty"></div>
<div class="report-heading" id="hidden"><p>First</p><p hidden>Hidden</p><p>Last</p></div>
<div class="gallery"><figure><img alt="Synthetic square" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Crect width='16' height='16' fill='%23888'/%3E%3C/svg%3E"><figcaption>Gallery stays interactive</figcaption></figure></div>
<div id="player"></div>
<script>
var errors=[]; window.addEventListener('error',function(e){errors.push(e.message)});
var spec={type:'bar',horizontal:true,labels:['River','Alex'],series:[{name:'Reviewed changes',values:[12,24]},{name:'Documentation changes',values:[4,8]}],height:240};
var chart=Morphise.chart('#chart',spec);
Morphise.chart('#legacy-chart',spec);
Morphise.chart('#daily',{type:'line',labels:['Mon','Tue','Wed'],series:[{name:'Changes',values:[12,18,24]}],height:200});
Morphise.chart('#donut',{type:'donut',labels:['Reviewed','Open'],series:[{name:'Changes',values:[24,12]}],height:200});
Morphise.player('#player',{width:320,height:120,scenes:[{duration:1,caption:'First scene',draw:function(){}},{duration:1,caption:'Second scene',draw:function(){}}]});
addEventListener('load',function(){
  function box(s){return document.querySelector(s).getBoundingClientRect()}
  function gap(a,b){return box(b).top-box(a).bottom}
  var style=getComputedStyle(document.querySelector('#chart .mk-legend'));
  var legend={rowGap:style.rowGap,columnGap:style.columnGap,marginBottom:style.marginBottom};
  var legacy=getComputedStyle(document.querySelector('#legacy-chart .mk-legend'));
  var before=box('#chart').height;
  var toggle=document.querySelector('#chart .mk-legend button');toggle.click();
  var toggled=document.querySelector('#chart .mk-legend button').getAttribute('aria-pressed');
  chart.update(spec);
  var svg=document.querySelector('#chart svg');svg.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  var tooltip=getComputedStyle(document.querySelector('.mk-tip')).display;
  document.querySelector('th').click();
  var sorted=document.querySelector('tbody tr td').textContent;
  var filter=document.querySelector('.mk-filter');filter.value='River';filter.dispatchEvent(new Event('input'));
  var filtered=document.querySelector('tbody tr').style.display;
  document.querySelector('.gallery img').click();var gallery=!!document.querySelector('.mk-zoom');
  document.querySelector('#player .mk-next').click();
  var playerReady=document.querySelector('#player .mk-caption').textContent==='Second scene';
  var metrics={heading:gap('#heading h2','#heading p'),section:gap('#heading','#data'),support:gap('#chart','#support'),sections:gap('#section','#next'),filter:gap('.mk-filter','.mk-table'),legend:[legend.rowGap,legend.columnGap,legend.marginBottom],legacyLegend:[legacy.rowGap,legacy.columnGap,legacy.marginBottom],legacy:gap('#legacy h2','#legacy p'),plain:gap('#plain h2','#plain p'),custom:gap('#custom h2','#custom p'),positioned:getComputedStyle(document.getElementById('positioned')).top,empty:box('#empty').height,hidden:gap('#hidden p:first-child','#hidden p:last-child'),overflow:document.documentElement.scrollWidth>innerWidth,chartHeight:box('#chart').height===before,toggled:toggled,tooltip:tooltip,sorted:sorted,filtered:filtered,gallery:gallery,player:playerReady,errors:errors};
  parent.document.title=JSON.stringify(metrics);
});
</script>`;

it.skipIf(!enabled).each([
  [360, false, false], [700, false, false], [1500, false, false],
  [360, true, false], [700, true, false], [1500, true, false],
  [360, false, true], [700, false, true], [1500, false, true],
  [360, true, true], [700, true, true], [1500, true, true],
])("spaces reports without changing legacy layouts at width %i, light %s, compact %s", { timeout: 30000 }, async (width, light, compact) => {
  const temp = mkdtempSync(join(tmpdir(), "morphise-spacing-"));
  try {
  const file = join(temp, "report.html");
  const theme = themeCss({ surface0: light ? "#ffffff" : "#16181d", surface1: light ? "#f1f3f5" : "#22252c", surface2: light ? "#e4e7eb" : "#2c3038", foreground: light ? "#20242a" : "#edf0f4", foregroundMuted: light ? "#555e6b" : "#a3adbc", border: "#697484", accent: "#597fff", accentForeground: "#ffffff", statusSuccess: "#298050", statusWarning: "#b78020", statusDanger: "#ce4545" }, { sans: "Arial, sans-serif", mono: "monospace" }, ["#597fff", "#bf63db"], compact);
  const document = htmlPage(content, theme).replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  writeFileSync(file, `<title>pending</title><iframe style="width:${width}px;height:4000px;border:0" srcdoc="${document}"></iframe>`);
  const runner = `const {chromium}=require(process.env.PLAYWRIGHT_MODULE);(async()=>{const browser=await chromium.launch({headless:true});try{const page=await browser.newPage();page.on('pageerror',e=>console.error(e.stack));await page.route('http**/*',route=>route.abort());await page.goto(process.argv[1]);await page.waitForFunction(()=>document.title.startsWith('{'),{},{timeout:10000});console.log(await page.title());}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});`;
  const result = await promisify(execFile)(process.execPath, ["-e", runner, pathToFileURL(file).href], { encoding: "utf8", timeout: 20000, maxBuffer: 4 * 1024 * 1024 });
  const report = JSON.parse(result.stdout.trim());
  expect(report.heading).toBe(8);
  expect(report.section).toBe(12);
  expect(report.support).toBe(16);
  expect(report.sections).toBe(24);
  expect(report.filter).toBe(8);
  expect(report.legend).toEqual(["8px", "16px", "12px"]);
  expect(report.legacyLegend).toEqual(["4px", "12px", "8px"]);
  expect(report.legacy).toBe(12);
  expect(report.plain).toBe(0);
  expect(report.custom).toBe(28);
  expect(report.positioned).toBe("4px");
  expect(report.empty).toBe(0);
  expect(report.hidden).toBe(8);
  expect(report.overflow).toBe(false);
  expect(report.chartHeight).toBe(true);
  expect(report.toggled).toBe("false");
  expect(report.tooltip).toBe("block");
  expect(report.sorted).toBe("Alex");
  expect(report.filtered).toBe("none");
  expect(report.gallery).toBe(true);
  expect(report.player).toBe(true);
  expect(report.errors).toEqual([]);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
