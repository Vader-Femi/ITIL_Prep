// ============================================================
// main.js — glue. Owns top-level app state and the timer loop.
// ============================================================
(function () {
  const bank = window.QUESTION_BANK || [];

  const state = {
    questionCount: Math.min(40, bank.length),
    timeMinutes: 30,
    session: null,
    history: [],
    timerHandle: null,
  };

  function stopTimer() {
    if (state.timerHandle) {
      clearInterval(state.timerHandle);
      state.timerHandle = null;
    }
  }

  function startTimer() {
    stopTimer();
    state.timerHandle = setInterval(() => {
      const remaining = Engine.remainingSeconds(state.session);
      UI.updateTimer(remaining, state.session.timeLimitSeconds);
      if (Engine.isTimeUp(state.session)) {
        finishQuiz({ auto: true });
      }
    }, 250);
  }

  function goToSetup() {
    stopTimer();
    state.session = null;
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
    UI.renderQuiz(state.session, quizHandlers);
    UI.updateTimer(Engine.remainingSeconds(state.session), state.session.timeLimitSeconds);
    startTimer();
  }

  const quizHandlers = {
    onSelect: (letter) => {
      Engine.selectAnswer(state.session, letter);
      UI.updateOptionSelection(state.session);
    },
    onNext: () => {
      if (Engine.canGoNext(state.session)) {
        Engine.goNext(state.session);
        UI.renderQuestion(state.session, quizHandlers, "fwd");
      } else {
        finishQuiz({ auto: false });
      }
    },
    onPrev: () => {
      if (Engine.canGoPrev(state.session)) {
        Engine.goPrev(state.session);
        UI.renderQuestion(state.session, quizHandlers, "back");
      }
    },
  };

  async function finishQuiz({ auto }) {
    if (!state.session || state.session.submitted) return;
    state.session.submitted = true;
    stopTimer();
    const graded = Engine.grade(state.session);

    const entry = { date: Date.now(), correct: graded.correct, total: graded.total, percentage: graded.percentage };
    state.history.unshift(entry);
    QuizAPI.pushHistory(entry);

    UI.renderResults(graded, { onRetry: goToSetup });
    if (auto) UI.showSnackbar("Time's up — your answers were submitted automatically.");
  }

  async function init() {
    state.history = await QuizAPI.loadHistory();
    goToSetup();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
