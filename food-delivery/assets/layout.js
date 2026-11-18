/* Shared page chrome: navigation and the data-honesty footer. */
(function () {
  const pages = [["index.html", "Overview"], ["explorer.html", "Explorer"], ["monitor.html", "Monitor"], ["study.html", "Study"], ["quality.html", "Data quality"], ["builder.html", "Build your own"]];
  const here = location.pathname.split("/").pop() || "index.html";
  const back = here !== "explorer.html" && history.length > 1 ? '<a href="#" id="navback" title="Go back one step">\u2190 Back</a>' : "";
  document.getElementById("nav").innerHTML = back + '<span class="brand">Food delivery intelligence</span>' +
    pages.map(([f, t]) => `<a href="${f}"${f === here ? ' aria-current="page"' : ""}>${t}</a>`).join("");
  document.getElementById("foot").innerHTML =
    "Data: two public Zomato datasets (Kaggle origin), cleaned by the pipeline in this repo. The delivery dataset shows signs of being generated rather than raw " +
    'platform logs, so treat findings as a demonstration of method. <a href="quality.html">See the evidence</a>.';

  const nb = document.getElementById("navback");
  if (nb) nb.addEventListener("click", (e) => { e.preventDefault(); history.back(); });

  // Arrived from the Explorer? Offer a way back to that exact view, and scroll to the section it pointed at.
  const q = new URLSearchParams(location.hash.slice(1)), xr = q.get("xr"), xl = q.get("xl");
  if (xr) {
    const bar = document.createElement("div");
    bar.className = "ctxbar";
    bar.innerHTML = "<span>Opened from the Explorer with <b></b></span><a></a>";
    bar.querySelector("b").textContent = xl || "your current view";
    const a = bar.querySelector("a");
    a.textContent = "\u2190 Back to your Explorer view";
    a.href = "explorer.html#" + xr;
    document.getElementById("nav").insertAdjacentElement("afterend", bar);
  }
  const sec = q.get("sec");
  if (sec) window.addEventListener("load", () => setTimeout(() => {
    const el = document.getElementById(sec);
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); el.classList.add("flash"); }
  }, 350));
})();
