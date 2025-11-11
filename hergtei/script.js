"use strict";

/* =========================
   NAV / SECTIONS
   ========================= */
(() => {
  const sections = Array.from(document.querySelectorAll("section"));
  const navLinks = document.querySelectorAll(".nav a");
  const ctr = document.getElementById("ctr");
  const tot = document.getElementById("tot");
  const bar = document.getElementById("bar");
  let idx = 0;

  if (tot) tot.textContent = sections.length;

  function show(i) {
    if (!sections.length) return;
    idx = Math.max(0, Math.min(sections.length - 1, i));
    sections.forEach((s, k) => s.classList.toggle("active", k === idx));
    const id = sections[idx].id;
    navLinks.forEach((a) => a.classList.toggle("active", a.dataset.goto === id));
    if (ctr) ctr.textContent = idx + 1;
    if (bar) bar.style.width = (((idx + 1) / sections.length) * 100) + "%";
    if (id) location.hash = "#" + id;
  }

  const prev = document.getElementById("prev");
  const next = document.getElementById("next");
  if (prev) prev.onclick = () => show(idx - 1);
  if (next) next.onclick = () => show(idx + 1);
  navLinks.forEach(a => a.onclick = (e) => {
    e.preventDefault();
    const k = sections.findIndex(s => s.id === a.dataset.goto);
    if (k > -1) show(k);
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") show(idx + 1);
    if (e.key === "ArrowLeft") show(idx - 1);
    if (e.key?.toLowerCase() === "f") {
      const el = document.documentElement;
      if (!document.fullscreenElement) el.requestFullscreen?.();
      else document.exitFullscreen?.();
    }
  });

  if (location.hash) {
    const k = sections.findIndex(s => "#" + s.id === location.hash);
    if (k > -1) show(k);
  } else {
    show(0);
  }
})();

/* =========================
   SIMULATOR — DOM helpers & state
   ========================= */
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const state = {
  rows: [],          // { id, arrival, burst, priority? }
  algo: "fcfs",      // 'fcfs' | 'sjf' | 'priority' | 'rr'
  quantum: 2
};

/* =========================
   Table render & input handlers
   ========================= */
function repaintTable() {
  const box = $("#list");
  if (!box) return;
  box.innerHTML = `
    <div class="trow head">
      <div>ID</div><div>Arrival</div><div>Burst</div><div>Priority</div><div>Del</div>
    </div>`;
  state.rows
    .slice()
    .sort((a, b) => a.arrival - b.arrival || a.id.localeCompare(b.id))
    .forEach((p, i) => {
      const r = document.createElement("div");
      r.className = "trow";
      r.innerHTML = `
        <div><b>${p.id}</b></div>
        <div>${p.arrival}</div>
        <div>${p.burst}</div>
        <div>${p.priority ?? "-"}</div>
        <div class="del"><button data-del="${i}">x</button></div>`;
      box.appendChild(r);
    });
  $$("#list [data-del]").forEach((btn) => {
    btn.onclick = () => {
      state.rows.splice(+btn.dataset.del, 1);
      repaintTable();
      clearViz();
    };
  });
}

/* inputs */
(() => {
  const add = $("#add");
  const seed = $("#seed");
  const clear = $("#clear");
  const form = $("#procForm");

  if (add) add.onclick = () => {
    const id = ($("#pid")?.value || "").trim() || `P${state.rows.length + 1}`;
    const arrival = Math.max(0, +$("#arrival")?.value || 0);
    const burst = Math.max(1, +$("#burst")?.value || 1);
    const pStr = $("#priority")?.value ?? "";
    const priority = (pStr === "" ? undefined : Math.max(0, +pStr));
    state.rows.push({ id, arrival, burst, priority });
    form?.reset();
    repaintTable();
  };

  if (seed) seed.onclick = () => {
    state.rows = [
      { id: "P1", arrival: 0, burst: 8, priority: 2 },
      { id: "P2", arrival: 1, burst: 4, priority: 1 },
      { id: "P3", arrival: 2, burst: 9, priority: 3 },
      { id: "P4", arrival: 3, burst: 5, priority: 2 }
    ];
    repaintTable();
  };

  if (clear) clear.onclick = () => { state.rows = []; repaintTable(); clearViz(); };

  $$("#algos .segBtn").forEach((b) => {
    b.onclick = () => {
      $$("#algos .segBtn").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      state.algo = b.dataset.a;
    };
  });

  const q = $("#quantum");
  if (q) q.oninput = (e) => state.quantum = Math.max(1, +e.target.value || 1);
})();

/* =========================
   LIVE SIMULATOR (step-by-step core)
   returns:
     { ticks:[frames], timeline:[...], statsByPid, avg }
   ticks[i] = {
     t, evt:{type, pid?}, running:{id, rt}?,
     qLeft?, ready:[{id,rt,pr}], done:[{id,ft}]
   }
   ========================= */
function simulateLive(procs, algo, quantum = 2) {
  const jobs = procs.map(p => ({
    id: p.id,
    at: Math.max(0, p.arrival | 0),
    bt: Math.max(1, p.burst | 0),
    pr: p.priority ?? 0,
    rt: Math.max(1, p.burst | 0),
    started: false,
    firstStart: null,
    finished: false
  })).sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));

  if (!jobs.length) return { ticks: [], timeline: [], statsByPid: {}, avg: {}, empty: true };

  const stats = Object.fromEntries(jobs.map(j => [j.id, { wait: 0, turn: 0, resp: null }]));
  const ready = [];
  const done = [];
  const ticks = [];

  let cur = null;
  let qLeft = quantum;
  let t = 0;

  const pick = () => {
    if (!ready.length) return null;
    if (algo === "fcfs") return ready.shift();
    if (algo === "sjf") {
      let k = 0; for (let i = 1; i < ready.length; i++) if (ready[i].rt < ready[k].rt) k = i;
      return ready.splice(k, 1)[0];
    }
    if (algo === "priority") {
      let k = 0; for (let i = 1; i < ready.length; i++) if (ready[i].pr < ready[k].pr) k = i;
      return ready.splice(k, 1)[0];
    }
    return ready.shift(); // rr
  };

  const snap = (evt) => {
    ticks.push({
      t,
      evt, // {type, pid?, note?}
      running: cur ? { id: cur.id, rt: cur.rt } : null,
      qLeft: (algo === "rr" && cur) ? qLeft : null,
      ready: ready.map(r => ({ id: r.id, rt: r.rt, pr: r.pr })),
      done: done.map(d => ({ id: d.id, ft: d.ft }))
    });
  };

  while (true) {
    // Enqueue arrivals at time t
    while (jobs.length && jobs[0].at <= t) {
      const a = jobs.shift();
      ready.push(a);
      snap({ type: "arrival", pid: a.id });
    }

    // If nothing running, pick or idle
    if (!cur) {
      if (!ready.length && !jobs.length) break; // all done
      if (!ready.length && jobs.length) {
        const nextAt = jobs[0].at;
        while (t < nextAt) { snap({ type: "idle" }); t += 1; }
        continue;
      }
      cur = pick();
      if (!cur.started) { cur.started = true; cur.firstStart = t; stats[cur.id].resp = t - cur.at; }
      if (algo === "rr") qLeft = quantum;
      snap({ type: "dispatch", pid: cur.id });
    }

    // Run 1 unit
    cur.rt -= 1;
    if (algo === "rr") qLeft -= 1;
    snap({ type: "run", pid: cur.id });
    t += 1;

    // Arrivals exactly at new t
    while (jobs.length && jobs[0].at <= t) {
      const a = jobs.shift();
      ready.push(a);
      snap({ type: "arrival", pid: a.id });
    }

    // --- SJF preemption (SRTF) ---
if (algo === "sjf" && cur && ready.length) {
  // ready дундаас үлдэгдэл хугацаа (rt) хамгийн бага процессыг олно
  let k = 0;
  for (let i = 1; i < ready.length; i++) {
    if (ready[i].rt < ready[k].rt) k = i;
  }
  // Хэрэв шинэ ирэгсдийн дундаас илүү богино үлдэгдэлтэй байвал preempt хийе
  if (ready[k].rt < cur.rt) {
    snap({ type: "context", pid: cur.id, note: "SRTF preempt" });
    ready.push(cur);   // одоогийнхыг буцаагаад ready рүү
    cur = null;        // дараагийн цикль дээр pick() дахин сонгоно
    continue;          // энэ мөчид шууд дахин шийдвэрлэ
  }
}


    // Completion?
    if (cur.rt <= 0) {
      cur.ft = t; done.push(cur);
      stats[cur.id].turn = cur.ft - cur.at;
      snap({ type: "complete", pid: cur.id });
      cur = null;
      continue;
    }

    // RR preemption?
    if (algo === "rr" && qLeft <= 0) {
      snap({ type: "context", pid: cur.id });
      ready.push(cur);
      cur = null;
      continue;
    }

    // Non-preemptive: continue next tick
  }

  // Wait = Turn - Burst
  Object.keys(stats).forEach(pid => {
    const src = procs.find(x => x.id === pid);
    stats[pid].wait = stats[pid].turn - src.burst;
  });

  const arr = Object.values(stats);
  const avg = {
    wait: (arr.reduce((s, v) => s + v.wait, 0) / arr.length).toFixed(2),
    turn: (arr.reduce((s, v) => s + v.turn, 0) / arr.length).toFixed(2),
    resp: (arr.reduce((s, v) => s + (v.resp ?? 0), 0) / arr.length).toFixed(2)
  };

  // Compact Gantt from ticks
  const timeline = [];
  let acc = null, timeCursor = 0;

  function flush() {
    if (!acc) return;
    timeline.push(acc);
    timeCursor += acc.dt;
    acc = null;
  }

  for (const k of ticks) {
    const type = (k.evt.type === "idle") ? "idle" : (k.evt.type === "context" ? "ctx" : "run");
    const label = (type === "run") ? (k.running?.id || "IDLE") : (type === "idle" ? "IDLE" : "CTX");
    if (acc && acc.id === label && acc.type === type) { acc.dt += 1; acc.t = timeCursor + acc.dt; }
    else { flush(); acc = { id: label, dt: 1, t: timeCursor + 1, type }; }
  }
  flush();

  return { ticks, timeline, statsByPid: stats, avg };
}

/* =========================
   Rendering
   ========================= */
function clearViz() {
  const res = $("#result");
  if (res) res.style.display = "none";
  ["#gantt", "#ticks", "#stats", "#readyQ", "#doneQ", "#elog"].forEach(sel => {
    const el = $(sel);
    if (el) el.innerHTML = "";
  });
  const cpuNow = $("#cpuNow"), qLeft = $("#qLeft"), ctx = $("#ctxState");
  if (cpuNow) cpuNow.textContent = "—";
  if (qLeft) qLeft.style.display = "none";
  if (ctx) ctx.style.display = "none";
}

function chip(pid, sub = "") {
  const d = document.createElement("div");
  d.className = "chip";
  d.textContent = pid;
  if (sub) {
    const s = document.createElement("span");
    s.className = "sub";
    s.textContent = sub;
    d.appendChild(s);
  }
  return d;
}

let playTimer = null;
const live = { frames: [], i: 0, speed: 220 };

function renderStatic(result, algoLabel) {
  const res = $("#result");
  if (!res) return;
  const { timeline, statsByPid, avg } = result;
  if (!timeline.length) return;
  res.style.display = "block";
  const algoShow = $("#algoShow");
  if (algoShow) algoShow.textContent = algoLabel;

  // Gantt
  const g = $("#gantt");
  if (g) {
    g.innerHTML = "";
    timeline.forEach(seg => {
      const d = document.createElement("div");
      d.className = "slice" + (seg.type === "idle" ? " idle" : seg.type === "ctx" ? " ctx" : "");
      d.style.width = Math.max(34, seg.dt * 38) + "px";
      d.title = `${seg.id} (dt=${seg.dt})`;
      d.textContent = seg.id;
      g.appendChild(d);
    });
  }

  // ticks
  const total = timeline.reduce((s, v) => s + v.dt, 0);
  const ticks = $("#ticks");
  if (ticks) ticks.textContent = Array.from({ length: total + 1 }, (_, k) => k).join("  ");

  // stats
  const sDiv = $("#stats");
  if (sDiv) {
    sDiv.innerHTML = "";
    Object.entries(statsByPid).forEach(([pid, s]) => {
      const el = document.createElement("div");
      el.className = "pill";
      el.innerHTML = `<b>${pid}</b> — WT: ${s.wait}, TAT: ${s.turn}, RT: ${s.resp}`;
      sDiv.appendChild(el);
    });
    const avgEl = document.createElement("div");
    avgEl.className = "pill";
    avgEl.innerHTML = `<b>Average</b> — WT: ${avg.wait}, TAT: ${avg.turn}, RT: ${avg.resp}`;
    sDiv.appendChild(avgEl);
  }
  const wrap = document.querySelector('#result .gantt-scroll');
if (wrap) wrap.scrollLeft = wrap.scrollWidth;

}

function renderLiveStart(result, algoLabel) {
  clearViz();
  const res = $("#result");
  if (!res) return;
  res.style.display = "block";
  const algoShow = $("#algoShow");
  if (algoShow) algoShow.textContent = algoLabel;
  live.frames = result.ticks;
  live.i = 0;
}

function stepOnce() {
  if (live.i >= live.frames.length) return false;
  const f = live.frames[live.i++];

  // ready
  const rq = $("#readyQ");
  if (rq) {
    rq.innerHTML = "";
    f.ready.forEach(r => rq.appendChild(chip(r.id, `rt:${r.rt}${typeof r.pr === "number" ? `, pr:${r.pr}` : ""}`)));
  }

  // cpu
  const cpuNow = $("#cpuNow"), qLeft = $("#qLeft"), ctx = $("#ctxState");
  if (f.evt.type === "idle") {
    if (cpuNow) cpuNow.textContent = "IDLE";
    if (ctx) ctx.style.display = "none";
    if (qLeft) qLeft.style.display = "none";
  } else if (f.evt.type === "context") {
    if (cpuNow) cpuNow.textContent = f.running?.id ?? "—";
    if (ctx) ctx.style.display = "inline-block";
    if (qLeft) qLeft.style.display = "none";
  } else {
    if (cpuNow) cpuNow.textContent = f.running?.id ?? "—";
    if (ctx) ctx.style.display = "none";
    if (qLeft) {
      if (f.qLeft != null) {
        qLeft.style.display = "inline-block";
        qLeft.textContent = `q: ${f.qLeft}`;
      } else qLeft.style.display = "none";
    }
  }

  // done
  const dq = $("#doneQ");
  if (dq) {
    dq.innerHTML = "";
    f.done.forEach(d => dq.appendChild(chip(d.id, `ft:${d.ft}`)));
  }

  // log
  const elog = $("#elog");
  if (elog) {
    const msg = (() => {
      switch (f.evt.type) {
        case "arrival": return `t=${f.t}: <b>${f.evt.pid}</b> arrived`;
        case "dispatch": return `t=${f.t}: dispatch <b>${f.evt.pid}</b> to CPU`;
        case "run": return `t=${f.t}: running <b>${f.evt.pid}</b>`;
        case "complete": return `t=${f.t}: <b>${f.evt.pid}</b> completed`;
        case "context": return `t=${f.t}: context switch`;
        case "idle": return `t=${f.t}: CPU idle`;
        default: return `t=${f.t}: event`;
      }
    })();
    const p = document.createElement("div");
    p.innerHTML = msg;
    elog.appendChild(p);
    elog.scrollTop = elog.scrollHeight;
  }

  return true;
}

function playLoop() {
  if (playTimer) return;
  playTimer = setInterval(() => {
    const more = stepOnce();
    if (!more) { clearInterval(playTimer); playTimer = null; }
  }, live.speed);
}

function stopLoop() {
  if (playTimer) { clearInterval(playTimer); playTimer = null; }
}

/* =========================
   Public render() shim (kept for compatibility)
   ========================= */
function render(result, algoLabel) {
  renderLiveStart(result, algoLabel);
  renderStatic(result, algoLabel); // also show final summary immediately
}

/* =========================
   RUN / PAUSE / STEP wiring
   ========================= */
(() => {
  const speed = $("#speed");
  if (speed) speed.oninput = (e) => {
    live.speed = +e.target.value;
    if (playTimer) { stopLoop(); playLoop(); }
  };

  const pause = $("#pause");
  if (pause) pause.onclick = () => {
    if (playTimer) { stopLoop(); pause.textContent = "Resume"; }
    else { playLoop(); pause.textContent = "Pause"; }
  };

  const step = $("#step");
  if (step) step.onclick = () => { stopLoop(); if (pause) pause.textContent = "Resume"; stepOnce(); };

  const run = $("#run");
  if (run) run.onclick = () => {
    if (!state.rows.length) { alert("Процесс нэмнэ үү."); return; }
    stopLoop();
    if (pause) pause.textContent = "Pause";
const algoMap = {
  fcfs: "FCFS (FIFO)",
  sjf: "SJF (preemptive, SRTF)", // өмнө нь non-preemptive гэж бичсэн байж магад
  priority: "Priority (lower number = higher)",
  rr: `Round-Robin (q=${state.quantum})`
};
    const out = simulateLive(state.rows, state.algo, state.quantum);
    render(out, algoMap[state.algo]);
    playLoop(); // autoplay
  };
})();

/* =========================
   INIT
   ========================= */
repaintTable();
