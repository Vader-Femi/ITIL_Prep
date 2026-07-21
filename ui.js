// ============================================================
// ui.js — rendering only. Reads engine state, writes the DOM.
// ============================================================
const UI = (() => {
  const root = document.getElementById("app");
  const snackbarEl = document.getElementById("snackbar");
  let snackbarTimer = null;

  function esc(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  function fmtTime(totalSeconds) {
    const s = Math.max(0, Math.round(totalSeconds));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  function showSnackbar(msg) {
    snackbarEl.textContent = msg;
    snackbarEl.classList.add("show");
    clearTimeout(snackbarTimer);
    snackbarTimer = setTimeout(() => snackbarEl.classList.remove("show"), 3200);
  }

  // ---------------- Setup screen ----------------
  function renderSetup({ bank, questionCount, timeMinutes, history }, handlers) {
    const presetsQ = [10, 20, 40, 80];
    const presetsT = [15, 30, 45, 60];

    const historyHtml = history && history.length
      ? `<div class="setup-section">
           <div class="eyebrow">Recent attempts</div>
           <div class="history-strip">
             ${history.slice(0, 8).map(h => `
               <div class="history-pill">
                 <b>${h.percentage}%</b>
                 ${h.correct}/${h.total} · ${new Date(h.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
               </div>`).join("")}
           </div>
         </div>`
      : "";

    root.innerHTML = `
      <div class="screen" id="screen-setup">
        <div class="eyebrow">ITIL 4 Foundation · Practice</div>
        <h1 class="headline">Ready to test<br/>what you know?</h1>
        <p class="subtext">${bank.length} real past-exam questions. Pick how many you want and how long you've got — we'll shuffle a fresh set every time.</p>

        <div class="setup-section">
          <div class="eyebrow">Questions</div>
          <div class="slider-value" id="q-count-label">${questionCount}</div>
          <input type="range" id="q-count-slider" min="1" max="${bank.length}" value="${questionCount}" />
          <div class="chip-row" id="q-presets">
            ${presetsQ.filter(p => p <= bank.length).map(p => `<button class="chip" data-val="${p}">${p}</button>`).join("")}
            <button class="chip" data-val="${bank.length}">All ${bank.length}</button>
          </div>
        </div>

        <div class="setup-section">
          <div class="eyebrow">Time limit</div>
          <div class="slider-value" id="time-label">${timeMinutes} min</div>
          <input type="range" id="time-slider" min="5" max="180" step="5" value="${timeMinutes}" />
          <div class="chip-row" id="t-presets">
            ${presetsT.map(p => `<button class="chip" data-val="${p}">${p} min</button>`).join("")}
          </div>
        </div>

        ${historyHtml}

        <div style="flex:1"></div>
        <button class="btn btn-filled btn-block" id="start-btn" style="margin-top:28px;">
          Start practice exam
        </button>
      </div>`;

    const qSlider = document.getElementById("q-count-slider");
    const tSlider = document.getElementById("time-slider");
    const qLabel = document.getElementById("q-count-label");
    const tLabel = document.getElementById("time-label");

    function syncChips(containerId, val) {
      document.querySelectorAll(`#${containerId} .chip`).forEach(c => {
        c.classList.toggle("selected", Number(c.dataset.val) === val);
      });
    }
    syncChips("q-presets", questionCount);
    syncChips("t-presets", timeMinutes);

    qSlider.addEventListener("input", () => {
      qLabel.textContent = qSlider.value;
      syncChips("q-presets", Number(qSlider.value));
      handlers.onQuestionCount(Number(qSlider.value));
    });
    tSlider.addEventListener("input", () => {
      tLabel.textContent = `${tSlider.value} min`;
      syncChips("t-presets", Number(tSlider.value));
      handlers.onTimeMinutes(Number(tSlider.value));
    });
    document.getElementById("q-presets").addEventListener("click", (e) => {
      const btn = e.target.closest(".chip");
      if (!btn) return;
      const val = Number(btn.dataset.val);
      qSlider.value = val;
      qLabel.textContent = val;
      syncChips("q-presets", val);
      handlers.onQuestionCount(val);
    });
    document.getElementById("t-presets").addEventListener("click", (e) => {
      const btn = e.target.closest(".chip");
      if (!btn) return;
      const val = Number(btn.dataset.val);
      tSlider.value = val;
      tLabel.textContent = `${val} min`;
      syncChips("t-presets", val);
      handlers.onTimeMinutes(val);
    });
    document.getElementById("start-btn").addEventListener("click", handlers.onStart);
  }

  // ---------------- Quiz screen ----------------
  function quizShellHtml() {
    return `
      <div class="screen" id="screen-quiz" style="padding-bottom:24px;">
        <div class="quiz-header">
          <div class="progress-track"><div class="progress-fill" id="progress-fill"></div></div>
          <div class="timer-ring-wrap" id="timer-ring">
            <svg viewBox="0 0 56 56">
              <circle class="track" cx="28" cy="28" r="24"></circle>
              <circle class="fill" id="timer-fill" cx="28" cy="28" r="24" stroke-dasharray="150.8" stroke-dashoffset="0"></circle>
            </svg>
            <div class="time-label" id="time-label"></div>
          </div>
        </div>
        <div class="q-counter" id="q-counter"></div>
        <div class="q-viewport" id="q-viewport"></div>
        <div class="quiz-footer">
          <button class="btn btn-icon" id="prev-btn" aria-label="Previous">‹</button>
          <button class="btn btn-filled" id="next-btn">Next</button>
        </div>
      </div>`;
  }

  function questionSlideHtml(session, q, cls) {
    const chosen = session.answers[q.uid];
    const opts = Object.entries(q.options).map(([letter, text]) => `
      <button class="option ${chosen === letter ? "selected" : ""}" data-letter="${letter}">
        <span class="letter">${letter}</span>
        <span class="opt-text">${esc(text)}</span>
      </button>`).join("");
    return `
      <div class="q-slide ${cls}">
        <div class="q-text">${esc(q.question)}</div>
        <div class="options">${opts}</div>
      </div>`;
  }

  function renderQuiz(session, handlers) {
    root.innerHTML = quizShellHtml();
    renderQuestion(session, handlers, "none");
    wireQuizChrome(session, handlers);
  }

  function wireQuizChrome(session, handlers) {
    document.getElementById("prev-btn").addEventListener("click", handlers.onPrev);
    document.getElementById("next-btn").addEventListener("click", handlers.onNext);
  }

  function renderQuestion(session, handlers, direction) {
    const viewport = document.getElementById("q-viewport");
    const q = Engine.currentQuestion(session);
    const total = session.questions.length;

    document.getElementById("q-counter").textContent = `Question ${session.index + 1} of ${total}`;
    document.getElementById("progress-fill").style.width = `${(session.index / total) * 100}%`;

    const prevBtn = document.getElementById("prev-btn");
    const nextBtn = document.getElementById("next-btn");
    prevBtn.disabled = !Engine.canGoPrev(session);
    nextBtn.textContent = Engine.canGoNext(session) ? "Next" : "Finish";

    const old = viewport.querySelector(".q-slide");
    const enterCls = direction === "back" ? "enter-back" : "enter-fwd";
    const exitCls = direction === "back" ? "exit-back" : "exit-fwd";

    const newSlide = document.createElement("div");
    newSlide.innerHTML = questionSlideHtml(session, q, direction === "none" ? "" : enterCls);
    const newSlideEl = newSlide.firstElementChild;
    viewport.appendChild(newSlideEl);

    newSlideEl.addEventListener("click", (e) => {
      const opt = e.target.closest(".option");
      if (!opt) return;
      handlers.onSelect(opt.dataset.letter);
    });

    if (old) {
      old.classList.add(exitCls);
      old.addEventListener("animationend", () => old.remove(), { once: true });
    }
  }

  function updateOptionSelection(session) {
    const q = Engine.currentQuestion(session);
    const chosen = session.answers[q.uid];
    const viewport = document.getElementById("q-viewport");
    const slide = viewport.lastElementChild;
    if (!slide) return;
    slide.querySelectorAll(".option").forEach(el => {
      el.classList.toggle("selected", el.dataset.letter === chosen);
    });
  }

  function updateTimer(remainingSeconds, totalSeconds) {
    const ring = document.getElementById("timer-ring");
    const fill = document.getElementById("timer-fill");
    const label = document.getElementById("time-label");
    if (!ring || !fill || !label) return;
    const frac = totalSeconds > 0 ? remainingSeconds / totalSeconds : 0;
    const circumference = 150.8;
    fill.style.strokeDashoffset = String(circumference * (1 - frac));
    label.textContent = fmtTime(remainingSeconds);
    ring.classList.toggle("warn", frac <= 0.3 && frac > 0.1);
    ring.classList.toggle("danger", frac <= 0.1);
  }

  // ---------------- Results screen ----------------
  function renderResults(graded, handlers) {
    const passed = graded.percentage >= 65; // ITIL Foundation pass mark is 65%
    const circumference = 465;
    const wrongCount = graded.total - graded.correct;

    root.innerHTML = `
      <div class="screen" id="screen-results">
        <div class="score-hero">
          <div class="score-ring-wrap">
            <svg viewBox="0 0 168 168">
              <circle class="track" cx="84" cy="84" r="74"></circle>
              <circle class="fill" id="score-fill" cx="84" cy="84" r="74"></circle>
            </svg>
            <div class="score-label">
              <div class="score-pct">${graded.percentage}%</div>
              <div class="score-frac">${graded.correct} / ${graded.total} correct</div>
            </div>
          </div>
          <span class="score-tag ${passed ? "pass" : "fail"}">${passed ? "Above pass mark (65%)" : "Below pass mark (65%)"}</span>
        </div>

        <div class="chip-row" id="review-filter" style="margin-top:22px;">
          <button class="chip selected" data-filter="all">All ${graded.total}</button>
          <button class="chip" data-filter="wrong">Incorrect ${wrongCount}</button>
        </div>

        <div class="review-list" id="review-list"></div>

        <div class="results-actions">
          <button class="btn btn-tonal btn-block" id="retry-btn">New practice set</button>
        </div>
      </div>`;

    renderReviewList(graded, "all");

    document.getElementById("review-filter").addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      document.querySelectorAll("#review-filter .chip").forEach(c => c.classList.remove("selected"));
      chip.classList.add("selected");
      renderReviewList(graded, chip.dataset.filter);
    });

    document.getElementById("retry-btn").addEventListener("click", handlers.onRetry);

    requestAnimationFrame(() => {
      const fill = document.getElementById("score-fill");
      const offset = circumference * (1 - graded.percentage / 100);
      fill.style.strokeDasharray = String(circumference);
      fill.style.strokeDashoffset = String(offset);
      fill.style.stroke = passed ? "var(--success)" : "var(--error)";
    });
  }

  function renderReviewList(graded, filter) {
    const list = document.getElementById("review-list");
    const items = graded.perQuestion.filter(pq => filter === "all" || !pq.isCorrect);
    list.innerHTML = items.map((pq, i) => reviewItemHtml(pq, i)).join("");

    list.querySelectorAll(".review-item").forEach((el, i) => {
      const pq = items[i];
      el.querySelector(".r-summary").addEventListener("click", () => {
        const detail = el.querySelector(".r-detail");
        detail.hidden = !detail.hidden;
      });
      const explainBtn = el.querySelector(".explain-btn");
      explainBtn.addEventListener("click", async () => {
        const box = el.querySelector(".explain-box");
        box.hidden = false;
        box.innerHTML = `<span class="dot-loader"><span></span><span></span><span></span></span>`;
        explainBtn.disabled = true;
        try {
          const text = await QuizAPI.explainQuestion(pq.question);
          box.textContent = text;
        } catch (e) {
          box.textContent = `Explanation unavailable right now. Correct answer: ${pq.question.answer}. ${pq.question.options[pq.question.answer]}`;
        }
        explainBtn.disabled = false;
      });
    });
  }

  function reviewItemHtml(pq, i) {
    const q = pq.question;
    const correctText = q.options[q.answer];
    const chosenText = pq.chosen ? q.options[pq.chosen] : null;
    const optionsHtml = Object.entries(q.options).map(([letter, text]) => {
      let cls = "";
      if (letter === q.answer) cls = "correct";
      else if (letter === pq.chosen) cls = "incorrect";
      return `<div class="option disabled ${cls}">
        <span class="letter">${letter}</span>
        <span class="opt-text">${esc(text)}</span>
      </div>`;
    }).join("");

    return `
      <div class="review-item ${pq.isCorrect ? "" : "wrong"}">
        <div class="r-summary" style="cursor:pointer;">
          <div class="r-q">${pq.isCorrect ? "✓" : "✗"} ${esc(q.question)}</div>
          ${pq.isCorrect
            ? `<div class="r-row">Your answer: <b>${pq.chosen}. ${esc(chosenText || "")}</b></div>`
            : `<div class="r-row your-wrong">Your answer: <b>${pq.chosen ? pq.chosen + ". " + esc(chosenText) : "Skipped"}</b></div>
               <div class="r-row correct">Correct answer: <b>${q.answer}. ${esc(correctText)}</b></div>`
          }
        </div>
        <div class="r-detail" ${pq.isCorrect ? "hidden" : ""}>
          <div class="options" style="margin-top:12px;">${optionsHtml}</div>
          <button class="explain-btn">✨ Explain this answer</button>
          <div class="explain-box" hidden></div>
        </div>
      </div>`;
  }

  return { renderSetup, renderQuiz, renderQuestion, updateOptionSelection, updateTimer, renderResults, showSnackbar, fmtTime };
})();
