// ============================================================
// api.js — on-demand AI explanations + local history persistence.
// Both are best-effort: if unavailable, the rest of the app
// (question selection, timer, grading, scoring) works regardless.
// ============================================================
const QuizAPI = (() => {
  const explanationCache = new Map();

  async function explainQuestion(q) {
    if (explanationCache.has(q.uid)) return explanationCache.get(q.uid);

    const optionLines = Object.entries(q.options)
      .map(([l, t]) => `${l}. ${t}`)
      .join("\n");
    const prompt =
      `This is an ITIL 4 Foundation exam practice question. In 2-3 short sentences, ` +
      `explain why the correct answer is right, referencing the relevant ITIL 4 concept ` +
      `or practice by name. Be concise and direct — no preamble.\n\n` +
      `Question: ${q.question}\n${optionLines}\n\nCorrect answer: ${q.answer}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!response.ok) throw new Error("explain-failed");
    const data = await response.json();
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (!text) throw new Error("explain-empty");
    explanationCache.set(q.uid, text);
    return text;
  }

  // ---- history (best-effort, personal/non-shared) ----
  const HISTORY_KEY = "quiz:history";

  async function loadHistory() {
    try {
      if (!window.storage) return [];
      const res = await window.storage.get(HISTORY_KEY, false);
      return res ? JSON.parse(res.value) : [];
    } catch (e) {
      return [];
    }
  }

  async function pushHistory(entry) {
    try {
      if (!window.storage) return;
      const list = await loadHistory();
      list.unshift(entry);
      await window.storage.set(HISTORY_KEY, JSON.stringify(list.slice(0, 20)), false);
    } catch (e) {
      // non-fatal — history is a nice-to-have
    }
  }

  return { explainQuestion, loadHistory, pushHistory };
})();
