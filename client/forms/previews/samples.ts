// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): client/dashboard/samples.ts
// The sample content the settings previews draw.
import type { Step } from "../../../shared/steps";

// 2×2 pixels each; scaled up they read as soft gradient screenshots.
export const PREVIEW_IMAGES = [
  { alt: "Login screen", url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAF0lEQVR4nGNIm3nm6JSjDPGbNyur6wEAMaQGJ9QR9U0AAAAASUVORK5CYII=" },
  { alt: "Settings screen", url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4tT35XVY+g4mt29EpRwEx0AaxEPAXmgAAAABJRU5ErkJggg==" },
  { alt: "Billing screen", url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAF0lEQVR4nGNYfG5e/ObNDHJK6mkzzwAALYoGB2KnSjcAAAAASUVORK5CYII=" },
];

export const LONG_MESSAGE = [
  "Move auth into one middleware and keep the tests green.",
  "Right now the token check runs twice on /api/billing: once in the router guard and once inside the handler.",
  "The second check reads a stale header after the refresh middleware rotated it, so users get logged out at random.",
  "Delete the per-route calls, mount requireAuth before the router, and let public routes opt out with skipAuth.",
  "Don't touch the session store; that migration lands next week.",
].join(" ");

export const SAMPLE_TABLE = [
  ["src/middleware/requireAuth.ts", "new file", "28", "0"],
  ["src/routes/billing.ts", "check removed", "2", "5"],
  ["src/server.ts", "mount", "1", "0"],
];

export const SAMPLE_CODE = ["export function requireAuth(req, next) {", "  const token = verifyToken(req);", "  if (!token) return deny(401);", "  next();", "}"];

export const SAMPLE_DIAGRAM = `flowchart LR
  req[Request] --> auth{requireAuth}
  auth -- valid --> router[Router]
  auth -- skipAuth --> router
  auth -- expired --> refresh[Refresh token]
  refresh --> auth`;

// The sentence the selection bar mock sits over, split around the selected phrase.
export const SELECTED_SENTENCE = { before: "Auth now runs once, so ", selected: "the stale header bug is gone", after: " and the 24 tests pass." };

export const SAMPLE_STEPS: Step[] = [
  { text: "Find every verifyToken() call", status: "completed" },
  { text: "Moving auth into requireAuth", status: "in_progress" },
  { text: "Run the auth tests", status: "pending" },
  { text: "Update the routing docs", status: "pending" },
];

// A page as an agent would write it, from the kit and theme variables the page tool describes; taller than 500 px, so
// the height limit shows.
export const SAMPLE_PAGE = `<div class="stack" style="gap:16px">
<div class="grid">
<div class="card stat"><div class="label">Requests</div><div class="value">1.28M</div><span class="chip" style="color:var(--success)">▲ 12% vs yesterday</span></div>
<div class="card stat"><div class="label">p95 latency</div><div class="value">184 ms</div><span class="chip" style="color:var(--success)">▼ 9%</span></div>
<div class="card stat"><div class="label">Error rate</div><div class="value">0.42%</div><span class="chip" style="color:var(--danger)">▲ 0.1 pt</span></div>
</div>
<div class="card" style="padding:16px 16px 8px">
<div class="row" style="justify-content:space-between;flex-wrap:nowrap"><b>p95 latency, last 24 hours</b><span class="small muted" id="readout">Hover the chart</span></div>
<svg id="chart" height="190" style="display:block;width:100%;margin-top:8px"></svg>
</div>
<div class="card" style="padding:16px">
<b>Slowest routes</b>
<table style="width:100%;margin-top:8px"><thead><tr><th>Route</th><th>p95</th><th>Calls</th></tr></thead><tbody>
<tr><td>/api/billing</td><td>412 ms</td><td>18,204</td></tr>
<tr><td>/api/users</td><td>238 ms</td><td>94,551</td></tr>
<tr><td>/api/search</td><td>201 ms</td><td>61,032</td></tr>
<tr><td>/api/session</td><td>96 ms</td><td>402,118</td></tr>
</tbody></table>
</div>
<div class="row"><button class="primary" id="replay">Replay</button><span class="small muted">Milliseconds, one point per hour. The 14:00 spike is a deploy.</span></div>
</div>
<script>
const pts=Array.from({length:24},(_,h)=>Math.round(150+60*Math.sin((h-6)/24*2*Math.PI)+18*Math.sin(h*1.7)+(h===14?70:0)));
const svg=document.getElementById("chart"),H=190,pad={l:36,r:8,t:8,b:24},ns="http://www.w3.org/2000/svg";let W=0;
const el=(t,a)=>{const e=document.createElementNS(ns,t);for(const k in a)e.setAttribute(k,a[k]);return e};
const hour=i=>String(i).padStart(2,"0")+":00";
function draw(animate){
W=svg.clientWidth;svg.setAttribute("viewBox","0 0 "+W+" "+H);svg.innerHTML="";
const max=Math.ceil(Math.max(...pts)/100)*100,x=i=>pad.l+i*(W-pad.l-pad.r)/23,y=v=>pad.t+(1-v/max)*(H-pad.t-pad.b);
const g=el("linearGradient",{id:"fill",x1:0,y1:0,x2:0,y2:1});g.append(el("stop",{offset:0,style:"stop-color:var(--chart-1);stop-opacity:.35"}),el("stop",{offset:1,style:"stop-color:var(--chart-1);stop-opacity:0"}));const defs=el("defs",{});defs.append(g);svg.append(defs);
for(let v=0;v<=max;v+=max/4){svg.append(el("line",{x1:pad.l,x2:W-pad.r,y1:y(v),y2:y(v),style:"stroke:var(--border)"}));const t=el("text",{x:pad.l-8,y:y(v)+4,"text-anchor":"end",style:"fill:var(--muted);font-size:11px"});t.textContent=v;svg.append(t)}
for(let i=0;i<24;i+=6){const t=el("text",{x:x(i),y:H-6,"text-anchor":i?"middle":"start",style:"fill:var(--muted);font-size:11px"});t.textContent=hour(i);svg.append(t)}
const line=pts.map((v,i)=>(i?"L":"M")+x(i)+" "+y(v)).join("");
const area=el("path",{d:line+"L"+x(23)+" "+y(0)+"L"+x(0)+" "+y(0)+"Z",fill:"url(#fill)"});
const path=el("path",{d:line,fill:"none",style:"stroke:var(--chart-1);stroke-width:2;stroke-linejoin:round"});
const cross=el("line",{y1:pad.t,y2:H-pad.b,style:"stroke:var(--muted);stroke-dasharray:3 3;opacity:0"}),dot=el("circle",{r:4,style:"fill:var(--chart-1);stroke:var(--bg);stroke-width:2;opacity:0"});
svg.append(area,path,cross,dot);
if(animate&&!matchMedia("(prefers-reduced-motion: reduce)").matches){const L=path.getTotalLength();path.style.strokeDasharray=L;path.style.strokeDashoffset=L;area.style.opacity=0;path.getBoundingClientRect();path.style.transition="stroke-dashoffset 1.2s ease-out";area.style.transition="opacity .6s ease-out .8s";path.style.strokeDashoffset=0;area.style.opacity=1}
svg.onmousemove=e=>{const r=svg.getBoundingClientRect(),i=Math.max(0,Math.min(23,Math.round((e.clientX-r.left-pad.l)/(W-pad.l-pad.r)*23)));cross.setAttribute("x1",x(i));cross.setAttribute("x2",x(i));dot.setAttribute("cx",x(i));dot.setAttribute("cy",y(pts[i]));cross.style.opacity=dot.style.opacity=1;readout.textContent=hour(i)+" · "+pts[i]+" ms"};
svg.onmouseleave=()=>{cross.style.opacity=dot.style.opacity=0;readout.textContent="Hover the chart"};
}
draw(true);new ResizeObserver(()=>{if(svg.clientWidth!==W)draw(false)}).observe(svg);replay.onclick=()=>draw(true);
</script>`;
