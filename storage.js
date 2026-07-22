// ============================================================
// storage.js — all localStorage persistence in one place.
// Every function is best-effort: a failure here (private
// browsing, storage disabled, quota) should never break the quiz.
// ============================================================
const Storage = (() => {
  const KEYS = {
    theme: "itilquiz.theme",
    session: "itilquiz.activeSession",
    history: "itilquiz.history",
    explanations: "itilquiz.explanations",
  };

  function safeGet(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
  function safeSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }
  function safeRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      /* ignore */
    }
  }

  // ---- theme: 'light' | 'dark' | null (null = follow system) ----
  function getTheme() {
    return safeGet(KEYS.theme);
  }
  function setTheme(theme) {
    safeSet(KEYS.theme, theme);
  }

  // ---- active session snapshot, for resume-after-refresh ----
  function saveActiveSession(session) {
    safeSet(KEYS.session, {
      questions: session.questions,
      index: session.index,
      answers: session.answers,
      timeLimitSeconds: session.timeLimitSeconds,
      remainingSeconds: Engine.remainingSeconds(session),
      savedAt: Date.now(),
    });
  }
  function loadActiveSession() {
    return safeGet(KEYS.session);
  }
  function clearActiveSession() {
    safeRemove(KEYS.session);
  }

  // ---- quiz history ----
  function loadHistory() {
    return safeGet(KEYS.history) || [];
  }
  function pushHistory(entry) {
    const list = loadHistory();
    list.unshift(entry);
    safeSet(KEYS.history, list.slice(0, 20));
  }

  // ---- explanation cache, keyed by the ORIGINAL pdf question id so it's
  // reused across every session that happens to draw that question again ----
  function getExplanation(sourceId) {
    const all = safeGet(KEYS.explanations) || {};
    return all[sourceId] || null;
  }
  function setExplanation(sourceId, text) {
    const all = safeGet(KEYS.explanations) || {};
    all[sourceId] = text;
    safeSet(KEYS.explanations, all);
  }

  return {
    getTheme,
    setTheme,
    saveActiveSession,
    loadActiveSession,
    clearActiveSession,
    loadHistory,
    pushHistory,
    getExplanation,
    setExplanation,
  };
})();
