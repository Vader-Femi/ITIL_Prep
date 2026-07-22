// ============================================================
// api.js — on-demand AI explanations, cached permanently per
// question so the same fixed 333-question bank is never
// re-explained twice on this device.
//
// Tries, in order:
//   1. Storage.getExplanation() — instant, no network
//   2. POST /api/explain — your own Vercel serverless function,
//      if you've deployed api/explain.js with ANTHROPIC_API_KEY set
//   3. Direct call to api.anthropic.com — works inside Claude's
//      own artifact preview, not on a plain static deploy
//   4. Static fallback text — always available, no network needed
// ============================================================
const QuizAPI = (() => {
  const inFlightCache = new Map(); // sourceId -> Promise, de-dupes concurrent clicks

  function buildPrompt(q) {
    const optionLines = Object.entries(q.options)
      .map(([l, t]) => `${l}. ${t}`)
      .join("\n");
    return (
      `This is an ITIL 4 Foundation exam practice question. In 2-3 short sentences, ` +
      `explain why the correct answer is right, referencing the relevant ITIL 4 concept ` +
      `or practice by name. Be concise and direct — no preamble.\n\n` +
      `Question: ${q.question}\n${optionLines}\n\nCorrect answer: ${q.answer}`
    );
  }

  function extractText(data) {
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (!text) throw new Error("empty-response");
    return text;
  }

  async function tryServerlessFunction(q) {
    const res = await fetch("/api/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q.question, options: q.options, answer: q.answer }),
    });
    if (!res.ok) throw new Error("serverless-failed");
    const data = await res.json();
    if (!data.explanation) throw new Error("serverless-empty");
    return data.explanation;
  }

  async function tryDirectAnthropicCall(q) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{ role: "user", content: buildPrompt(q) }],
      }),
    });
    if (!res.ok) throw new Error("direct-call-failed");
    return extractText(await res.json());
  }

  async function explainQuestion(q) {
    const cached = Storage.getExplanation(q.sourceId);
    if (cached) return cached;

    if (inFlightCache.has(q.sourceId)) return inFlightCache.get(q.sourceId);

    const promise = (async () => {
      let text;
      try {
        text = await tryServerlessFunction(q);
      } catch (e1) {
        try {
          text = await tryDirectAnthropicCall(q);
        } catch (e2) {
          inFlightCache.delete(q.sourceId);
          throw new Error("all-explain-methods-failed");
        }
      }
      Storage.setExplanation(q.sourceId, text);
      inFlightCache.delete(q.sourceId);
      return text;
    })();

    inFlightCache.set(q.sourceId, promise);
    return promise;
  }

  return { explainQuestion };
})();
