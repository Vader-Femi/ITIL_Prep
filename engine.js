// ============================================================
// engine.js — quiz state & logic. No DOM code lives here.
// ============================================================
const Engine = (() => {
  const LETTERS = ["A", "B", "C", "D"];

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Pick `count` random questions from the bank, and re-shuffle each
  // question's option order so the answer letter isn't always in the
  // same position as the source PDF.
  function buildQuestionSet(bank, count) {
    const picked = shuffle(bank).slice(0, Math.min(count, bank.length));
    return picked.map((q, idx) => {
      const entries = LETTERS.map((l) => [l, q.options[l]]).filter(([, text]) => text != null);
      const shuffled = shuffle(entries);
      const options = {};
      let newAnswerLetter = null;
      shuffled.forEach(([origLetter, text], i) => {
        const letter = LETTERS[i];
        options[letter] = text;
        if (origLetter === q.answer) newAnswerLetter = letter;
      });
      return {
        uid: `${q.id}-${idx}`,
        sourceId: q.id,
        question: q.question,
        options,
        answer: newAnswerLetter,
      };
    });
  }

  function createSession({ bank, questionCount, timeMinutes }) {
    const questions = buildQuestionSet(bank, questionCount);
    return {
      questions,
      index: 0,
      answers: {}, // uid -> chosen letter
      timeLimitSeconds: Math.round(timeMinutes * 60),
      startedAt: Date.now(),
      submitted: false,
    };
  }

  function currentQuestion(session) {
    return session.questions[session.index];
  }

  function selectAnswer(session, letter) {
    const q = currentQuestion(session);
    session.answers[q.uid] = letter;
  }

  function canGoNext(session) {
    return session.index < session.questions.length - 1;
  }
  function canGoPrev(session) {
    return session.index > 0;
  }
  function goNext(session) {
    if (canGoNext(session)) session.index += 1;
  }
  function goPrev(session) {
    if (canGoPrev(session)) session.index -= 1;
  }

  function elapsedSeconds(session) {
    return (Date.now() - session.startedAt) / 1000;
  }
  function remainingSeconds(session) {
    return Math.max(0, session.timeLimitSeconds - elapsedSeconds(session));
  }
  function isTimeUp(session) {
    return remainingSeconds(session) <= 0;
  }

  function answeredCount(session) {
    return Object.keys(session.answers).length;
  }

  function grade(session) {
    const total = session.questions.length;
    let correct = 0;
    const perQuestion = session.questions.map((q) => {
      const chosen = session.answers[q.uid] || null;
      const isCorrect = chosen === q.answer;
      if (isCorrect) correct += 1;
      return { question: q, chosen, isCorrect };
    });
    const percentage = total === 0 ? 0 : Math.round((correct / total) * 100);
    return {
      total,
      correct,
      percentage,
      timeTakenSeconds: Math.min(session.timeLimitSeconds, elapsedSeconds(session)),
      perQuestion,
    };
  }

  return {
    LETTERS,
    buildQuestionSet,
    createSession,
    currentQuestion,
    selectAnswer,
    canGoNext,
    canGoPrev,
    goNext,
    goPrev,
    remainingSeconds,
    isTimeUp,
    answeredCount,
    grade,
  };
})();
