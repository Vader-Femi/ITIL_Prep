// api/explain.js
//
// Vercel serverless function (Node.js runtime). Deploying this file at
// api/explain.js next to your static site automatically exposes it at
// POST /api/explain — that relative path is exactly what api.js calls first.
//
// Setup: in your Vercel project settings, add an environment variable
//   ANTHROPIC_API_KEY = sk-ant-...
// then redeploy. Without that env var this function returns a 500 and
// api.js will silently fall back to its next strategy.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { question, options, answer } = req.body || {};
  if (!question || !options || !answer) {
    res.status(400).json({ error: "Missing question, options, or answer" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured on this deployment" });
    return;
  }

  const optionLines = Object.entries(options)
    .map(([letter, text]) => `${letter}. ${text}`)
    .join("\n");
  const prompt =
    `This is an ITIL 4 Foundation exam practice question. In 2-3 short sentences, ` +
    `explain why the correct answer is right, referencing the relevant ITIL 4 concept ` +
    `or practice by name. Be concise and direct — no preamble.\n\n` +
    `Question: ${question}\n${optionLines}\n\nCorrect answer: ${answer}`;

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      res.status(502).json({ error: "Upstream Anthropic API error", detail: errText });
      return;
    }

    const data = await upstream.json();
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (!text) {
      res.status(502).json({ error: "Empty response from Anthropic API" });
      return;
    }

    res.status(200).json({ explanation: text });
  } catch (err) {
    res.status(502).json({ error: "Request to Anthropic API failed" });
  }
}
