// ============================================================
// main.js — glue. Owns top-level app state, the timer loop,
// pause/resume, session persistence, and keyboard shortcuts.
// ============================================================
(function () {
  const bank = window.QUESTION_BANK || [];
  const SAVE_INTERVAL_MS = 2000;

  const state = {
    questionCount: Math.min(40, bank.length),
    timeMinutes: 30,
    session: null,
    history: [],
    timerHandle: null,
    screen: "setup", // 'setup' | 'quiz' | 'results'
    lastSaveAt: 0,
  };

  function stopTimer() {
    if (state.timerHandle) {
      clearInterval(state.timerHandle);
      state.timerHandle = null;
    }
  }

  function persistActiveSession(force) {
    if (!state.session || state.session.submitted) return;
    const now = Date.now();
    if (!force && now - state.lastSaveAt < SAVE_INTERVAL_MS) return;
    state.lastSaveAt = now;
    Storage.saveActiveSession(state.session);
  }

  function startTimer() {
    stopTimer();
    state.timerHandle = setInterval(() => {
      const remaining = Engine.remainingSeconds(state.session);
      UI.updateTimer(remaining, state.session.timeLimitSeconds);
      persistActiveSession(false);
      if (Engine.isTimeUp(state.session)) {
        finishQuiz({ auto: true });
      }
    }, 250);
  }

  function goToSetup() {
    stopTimer();
    state.session = null;
    state.screen = "setup";
    UI.setThemeToggleVisible(true);
    UI.renderSetup(
      { bank, questionCount: state.questionCount, timeMinutes: state.timeMinutes, history: state.history },
      {
        onQuestionCount: (v) => (state.questionCount = v),
        onTimeMinutes: (v) => (state.timeMinutes = v),
        onStart: startQuiz,
      }
    );
  }

  function startQuiz() {
    if (bank.length === 0) {
      UI.showSnackbar("No questions loaded.");
      return;
    }
    state.session = Engine.createSession({
      bank,
      questionCount: state.questionCount,
      timeMinutes: state.timeMinutes,
    });
    enterQuizScreen();
  }

  function enterQuizScreen() {
    state.screen = "quiz";
    UI.setThemeToggleVisible(false);
    UI.renderQuiz(state.session, quizHandlers);
    UI.updateTimer(Engine.remainingSeconds(state.session), state.session.timeLimitSeconds);
    startTimer();
  }

  const quizHandlers = {
    onSelect: (letter) => {
      if (Engine.isPaused(state.session)) return;
      Engine.selectAnswer(state.session, letter);
      UI.updateOptionSelection(state.session);
      persistActiveSession(true);
    },
    onNext: () => {
      if (transitioning || Engine.isPaused(state.session)) return;
      if (Engine.canGoNext(state.session)) {
        transitioning = true;
        Engine.goNext(state.session);
        UI.renderQuestion(state.session, quizHandlers, "fwd");
        persistActiveSession(true);
        setTimeout(() => { transitioning = false; }, 450);
      } else {
        finishQuiz({ auto: false });
      }
    },
    onPrev: () => {
      if (transitioning || Engine.isPaused(state.session)) return;
      if (Engine.canGoPrev(state.session)) {
        transitioning = true;
        Engine.goPrev(state.session);
        UI.renderQuestion(state.session, quizHandlers, "back");
        persistActiveSession(true);
        setTimeout(() => { transitioning = false; }, 450);
      }
    },
    onPauseToggle: () => {
      if (Engine.isPaused(state.session)) {
        Engine.resume(state.session);
      } else {
        Engine.pause(state.session);
      }
      UI.setPaused(state.session, Engine.isPaused(state.session));
      persistActiveSession(true);
    },
  };

  let transitioning = false;

  async function finishQuiz({ auto }) {
    if (!state.session || state.session.submitted) return;
    state.session.submitted = true;
    stopTimer();
    Storage.clearActiveSession();
    const graded = Engine.grade(state.session);

    const entry = { date: Date.now(), correct: graded.correct, total: graded.total, percentage: graded.percentage };
    state.history.unshift(entry);
    Storage.pushHistory(entry);

    state.screen = "results";
    UI.setThemeToggleVisible(true);
    UI.renderResults(graded, { onRetry: goToSetup });
    if (auto) UI.showSnackbar("Time's up — your answers were submitted automatically.");
  }

  // ---------------- Resume-in-progress-session prompt ----------------
  function maybeOfferResume() {
    const snap = Storage.loadActiveSession();
    if (!snap || !snap.questions || !snap.questions.length) return;
    UI.showResumeModal(
      { index: snap.index, total: snap.questions.length, remainingSeconds: snap.remainingSeconds },
      {
        onResume: () => {
          state.session = Engine.restoreSession(snap);
          enterQuizScreen();
        },
        onDiscard: () => {
          Storage.clearActiveSession();
        },
      }
    );
  }

  // ---------------- Keyboard shortcuts (quiz screen only) ----------------
  function initKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
      if (state.screen !== "quiz" || !state.session || Engine.isPaused(state.session)) return;
      const key = e.key.toUpperCase();
      if (["A", "B", "C", "D"].includes(key)) {
        const q = Engine.currentQuestion(state.session);
        if (q.options[key] != null) quizHandlers.onSelect(key);
      } else if (e.key === "Enter") {
        quizHandlers.onNext();
      } else if (e.key === "ArrowRight") {
        quizHandlers.onNext();
      } else if (e.key === "ArrowLeft") {
        quizHandlers.onPrev();
      }
    });
  }

  // ---------------- Init ----------------
  function init() {
    UI.applyTheme(Storage.getTheme());
    UI.initThemeToggle((theme) => Storage.setTheme(theme));

    state.history = Storage.loadHistory();
    goToSetup();
    maybeOfferResume();
    initKeyboardShortcuts();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
