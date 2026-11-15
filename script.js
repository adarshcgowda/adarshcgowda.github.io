/* Portfolio interactions. Plain JavaScript, no libraries.
   Every section is readable without this file; it only adds the interactive layer.
   Motion is skipped for people who ask for reduced motion. */

(() => {
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const SVG_NS = "http://www.w3.org/2000/svg";

  // Header: reading progress and the current section in the nav

  function initProgress() {
    const bar = $(".progress__bar");
    if (!bar) return;
    let queued = false;
    const update = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      bar.style.transform = `scaleX(${max > 0 ? Math.min(scrollY / max, 1) : 0})`;
      queued = false;
    };
    addEventListener("scroll", () => {
      if (!queued) requestAnimationFrame(update);
      queued = true;
    }, { passive: true });
    update();
  }

  function initNav() {
    const links = $$(".nav a");
    const sections = links.map((a) => $(a.getAttribute("href"))).filter(Boolean);
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((a) => {
          if (a.getAttribute("href") === `#${entry.target.id}`) a.setAttribute("aria-current", "true");
          else a.removeAttribute("aria-current");
        });
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    sections.forEach((s) => observer.observe(s));
  }

  // Prologue: find the month that's wrong

  function parsePoints(d) {
    return d.match(/-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?/g).map((pair) => pair.split(",").map(Number));
  }

  function initGame() {
    const fig = $("[data-game]");
    if (!fig) return;
    const svg = $("svg", fig);
    const tip = $(".game__tip", fig);
    const status = $("[data-game-status]", fig);
    const hintButton = $("[data-game-hint]", fig);
    const revealButton = $("[data-game-reveal]", fig);
    const actions = $(".game__actions", fig);

    const points = parsePoints($(".hero-chart__line", svg).getAttribute("d"));
    const band = parsePoints($(".hero-chart__band", svg).getAttribute("d"));
    const n = points.length;
    const top = band.slice(0, n);
    const bottom = band.slice(n).reverse();
    const answer = points.findIndex(([, y], i) => y > bottom[i][1] || y < top[i][1]);

    // Illustrative units: higher on the chart means a bigger number
    const value = (y) => Math.round((250 - y) * 6);
    const range = (i) => `${value(bottom[i][1])}–${value(top[i][1])}`;

    let wrong = 0;
    let done = false;

    const make = (tag, attrs, parent) => {
      const el = document.createElementNS(SVG_NS, tag);
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      parent.appendChild(el);
      return el;
    };

    const guesses = make("g", { class: "game__guesses" }, svg);
    const guide = make("g", { class: "game__guide" }, svg);
    const guideLine = make("line", { y1: 0, y2: 250 }, guide);
    const guideDot = make("circle", { r: 7 }, guide);
    const hits = make("g", { class: "game__hits" }, svg);

    const setStatus = (html) => { status.innerHTML = html; };

    const showTip = (i) => {
      const [x, y] = points[i];
      guideLine.setAttribute("x1", x);
      guideLine.setAttribute("x2", x);
      guideDot.setAttribute("cx", x);
      guideDot.setAttribute("cy", y);
      guide.classList.add("is-visible");
      const revealed = fig.classList.contains("is-revealed");
      tip.textContent = `Month ${i + 1}: ${value(y)}` + (revealed ? ` · expected ${range(i)}` : "");
      tip.style.left = `${x / 10}%`;
      tip.style.top = `${y / 2.5}%`;
      tip.hidden = false;
    };

    const hideTip = () => {
      guide.classList.remove("is-visible");
      tip.hidden = true;
    };

    const revealRange = () => fig.classList.add("is-revealed");

    const finish = (foundIt) => {
      done = true;
      revealRange();
      fig.classList.add("is-found");
      hits.remove();
      hideTip();
      actions.innerHTML = '<a class="chip-button" href="#cases">See how I build these</a>';
      setStatus(
        (foundIt ? `<strong>Found it.</strong> Month ${answer + 1} dropped to ${value(points[answer][1])} when ${range(answer)} was expected. ` : `<strong>Month ${answer + 1}.</strong> It dropped to ${value(points[answer][1])} when ${range(answer)} was expected. `) +
        "Spotting it by eye works for one chart. I build systems that do it automatically across 24 countries and 20+ platforms, and attach a reason to every flag."
      );
    };

    const guess = (i) => {
      if (done) return;
      if (i === answer) return finish(true);
      wrong += 1;
      const [x, y] = points[i];
      make("circle", { cx: x, cy: y, r: 7 }, guesses);
      const inRange = `Month ${i + 1} is inside its expected range (${range(i)}).`;
      if (fig.classList.contains("is-revealed")) {
        setStatus(`${inRange} Look for the point outside the shaded band.`);
      } else if (wrong >= 2) {
        revealRange();
        setStatus(`${inRange} Here’s the expected range. That’s the trick: judge each month against its own baseline, not by eye.`);
        hintButton.hidden = true;
      } else {
        setStatus(`Not that one. ${inRange} Try again, or ask for the expected range.`);
      }
    };

    points.forEach(([x, y], i) => {
      const hit = make("rect", {
        x: x - 20, y: 0, width: 40, height: 250,
        tabindex: 0, role: "button",
        "aria-label": `Month ${i + 1}, value ${value(y)}`,
      }, hits);
      hit.addEventListener("pointerenter", () => showTip(i));
      hit.addEventListener("focus", () => showTip(i));
      hit.addEventListener("pointerleave", hideTip);
      hit.addEventListener("blur", hideTip);
      hit.addEventListener("click", () => guess(i));
      hit.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          guess(i);
        }
      });
    });

    hintButton.addEventListener("click", () => {
      revealRange();
      hintButton.hidden = true;
      setStatus("The shaded band is what each month should look like, given its recent history. Now which month is wrong?");
    });
    revealButton.addEventListener("click", () => finish(false));

    setStatus("Hover or tap the chart to read each month, then pick the one you’d check first.");
  }

  // Snapshot: numbers count up once, when they first come into view

  function initCounters() {
    const els = $$("[data-count]");
    if (reduceMotion || !els.length) return;
    const run = (el) => {
      const [, prefix, num, suffix] = el.textContent.match(/^(\D*)(\d+)(.*)$/);
      const target = Number(num);
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min((now - start) / 900, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = `${prefix}${Math.round(target * eased)}${suffix}`;
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        run(entry.target);
      });
    }, { threshold: 0.6 });
    els.forEach((el) => observer.observe(el));
  }

  // Chapter 1: the route draws to whichever chapter is in the middle of the screen

  function initJourney() {
    const root = $("[data-journey]");
    if (!root) return;
    const chapters = $$(".chapter", root);
    const segments = $$(".route__seg", root);
    const stops = $$(".route__stop", root);
    const place = $("[data-journey-place]", root);
    const question = $("[data-journey-question]", root);
    const kit = $("[data-journey-tools]", root);
    const toolsAt = chapters.map((c) => c.dataset.tools.split(",").map((t) => t.trim()).filter(Boolean));
    let current = -1;

    const activate = (i) => {
      if (i === current) return;
      current = i;
      chapters.forEach((c, k) => c.classList.toggle("is-active", k === i));
      stops.forEach((s, k) => {
        s.classList.toggle("is-reached", k <= i);
        s.classList.toggle("is-current", k === i);
      });
      segments.forEach((s, k) => s.classList.toggle("is-drawn", k < i));
      place.textContent = chapters[i].dataset.place;
      question.textContent = `“${chapters[i].dataset.question}”`;
      kit.replaceChildren(...toolsAt.slice(0, i + 1).flatMap((tools, k) => tools.map((tool) => {
        const li = document.createElement("li");
        li.textContent = tool;
        if (k === i) li.className = "is-new";
        return li;
      })));
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) activate(chapters.indexOf(entry.target));
      });
    }, { rootMargin: "-45% 0px -45% 0px" });
    chapters.forEach((c) => observer.observe(c));
    activate(0);
  }

  // Chapter 2: case tabs, each stepping from signal to impact

  function initCases() {
    const root = $("[data-cases]");
    if (!root) return;
    const tabs = $$("[role=tab]", root);
    const panels = $$("[role=tabpanel]", root);

    const setStage = (panel, k) => {
      const steps = $$(".track__step", panel);
      const stages = $$(".stage", panel);
      const last = stages.length - 1;
      panel.style.setProperty("--stage", k);
      panel.style.setProperty("--stages", last);
      stages.forEach((s, j) => { s.hidden = j !== k; });
      steps.forEach((b, j) => {
        b.classList.toggle("is-done", j < k);
        if (j === k) b.setAttribute("aria-current", "step");
        else b.removeAttribute("aria-current");
      });
      $("[data-prev]", panel).disabled = k === 0;
      const next = $("[data-next]", panel);
      const lastPanel = panels.indexOf(panel) === panels.length - 1;
      next.textContent = k < last ? `Next: ${steps[k + 1].textContent}` : (lastPanel ? "Back to the first case" : "Next case");
      panel.dataset.stage = k;
    };

    const select = (i, focus = false) => {
      tabs.forEach((t, k) => {
        t.setAttribute("aria-selected", String(k === i));
        t.tabIndex = k === i ? 0 : -1;
      });
      panels.forEach((p, k) => { p.hidden = k !== i; });
      setStage(panels[i], 0);
      if (focus) tabs[i].focus();
    };

    tabs.forEach((tab, i) => {
      tab.addEventListener("click", () => select(i));
      tab.addEventListener("keydown", (e) => {
        const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
        if (!step) return;
        e.preventDefault();
        select((i + step + tabs.length) % tabs.length, true);
      });
    });

    panels.forEach((panel, i) => {
      $$(".track__step", panel).forEach((b, k) => b.addEventListener("click", () => setStage(panel, k)));
      $("[data-prev]", panel).addEventListener("click", () => setStage(panel, Number(panel.dataset.stage) - 1));
      $("[data-next]", panel).addEventListener("click", () => {
        const k = Number(panel.dataset.stage);
        if (k < $$(".stage", panel).length - 1) setStage(panel, k + 1);
        else select((i + 1) % panels.length, true);
      });
    });

    select(0);
  }

  // Chapter 3: the five steps, applied to the question the visitor picks

  const METHOD_ANSWERS = [
    null, // "In general" keeps the text already on the page
    [
      "Keep, change or roll back the threshold? The growth lead decides, so the answer has to fit that call.",
      "Success is orders per customer and margin per order. Guardrails are basket size and cancellations.",
      "Treatment-versus-control SQL and a power check, drafted with an AI agent from the written spec.",
      "Reconcile order counts to finance totals and confirm the split really was random.",
      "A weekly guardrail alert, in case margins drift after the rollout.",
    ],
    [
      "Is this a real drop or a data problem? And who has to act if it’s real?",
      "Orders means completed orders, not placed ones, with the same definition as last week’s report.",
      "Break the drop down by day, platform, area and pipeline stage.",
      "Check ingestion counts first. Often the number moved, not the city.",
      "A same-day alert, so the next drop shows up before the weekly review.",
    ],
    [
      "Which decision rides on this number, and how wrong can it afford to be?",
      "Trace the metric back to its written definition, or write one if there isn’t one.",
      "Rebuild it independently in SQL from the source tables.",
      "Compare stage by stage until the two numbers agree, and log why they didn’t.",
      "A data-quality check that runs before every refresh.",
    ],
  ];

  function initMethod() {
    const root = $("[data-method]");
    if (!root) return;
    const buttons = $$("[data-q]", root);
    const texts = $$(".step p", root);
    const steps = $$(".step", root);
    METHOD_ANSWERS[0] = texts.map((p) => p.textContent);

    buttons.forEach((button) => button.addEventListener("click", () => {
      const q = Number(button.dataset.q);
      buttons.forEach((b) => {
        const on = b === button;
        b.classList.toggle("is-selected", on);
        b.setAttribute("aria-pressed", String(on));
      });
      texts.forEach((p, k) => { p.textContent = METHOD_ANSWERS[q][k]; });
      if (reduceMotion) return;
      steps.forEach((s, k) => {
        s.classList.remove("is-refresh");
        void s.offsetWidth; // restart the fade so each change is visible
        s.style.animationDelay = `${k * 60}ms`;
        s.classList.add("is-refresh");
      });
    }));
  }

  initProgress();
  initNav();
  initGame();
  initCounters();
  initJourney();
  initCases();
  initMethod();
})();
