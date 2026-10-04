let embeddedBank;
const progressKey = "mra-study-guide-progress-v1";
let portableEvents = [],
  portablePersistent = true;
try {
  const previous = localStorage.getItem(progressKey);
  if (previous) {
    const parsed = JSON.parse(previous);
    if (
      !Array.isArray(parsed) ||
      !parsed.every(
        (e) =>
          e &&
          typeof e.key === "string" &&
          typeof e.qid === "string" &&
          typeof e.correct === "boolean",
      )
    )
      throw Error("Invalid progress");
    portableEvents = parsed;
    // Keep a one-time copy before adding optional confidence fields.
    try { if (!localStorage.getItem("mra-progress-before-learning")) localStorage.setItem("mra-progress-before-learning", previous); } catch {}
  }
  localStorage.setItem(progressKey, JSON.stringify(portableEvents));
} catch {
  portablePersistent = false;
}
const portableResponse = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => JSON.parse(JSON.stringify(data)),
});
const fetch = async (url, options = {}) => {
  if (url === "/bank.json") {
    if (!embeddedBank) embeddedBank = await loadQuestionBank();
    return portableResponse(embeddedBank);
  }
  if (url === "/api/progress") {
    if (globalThis.MRAAuth) {
      try {
        portableEvents = await globalThis.MRAAuth.mergeWithCloud(portableEvents);
        if (portablePersistent)
          localStorage.setItem(progressKey, JSON.stringify(portableEvents));
      } catch (e) {
        console.warn("Cloud progress sync unavailable; continuing in browser.", e);
      }
    }
    return portableResponse({ events: portableEvents });
  }
  if (url === "/api/answer") {
    const b = JSON.parse(options.body),
      base = embeddedBank.questions.find((q) => q.id === b.qid);
    const form = b.variant
      ? base?.variants?.find((v) => v.variant === b.variant)
      : null;
    if (b.variant && !form)
      return portableResponse({ error: "Question variation not found." }, 400);
    const q = base ? { ...base, ...form } : null;
    if (!q) return portableResponse({ error: "Question not found." }, 400);
    const key = b.run + "/" + q.id,
      old = portableEvents.find((e) => e.key === key);
    if (old) return portableResponse({ event: old });
    const correct =
      q.numeric !== undefined
        ? b.mode === "match"
          ? b.answer === q.answer
          : b.answer.trim() !== "" &&
            Number.isFinite(Number(b.answer)) &&
            Math.abs(Number(b.answer) - q.numeric) <= q.tolerance
        : b.answer === q.answer;
    const event = {
      key,
      qid: q.id,
      variant: b.variant,
      topic: b.topic,
      run: b.run,
      world: b.world,
      mode: b.mode,
      total: b.total,
      correct,
      guessed: b.guessed === true,
      at: new Date().toISOString(),
    };
    portableEvents.push(event);
    if (portablePersistent) {
      try {
        localStorage.setItem(progressKey, JSON.stringify(portableEvents));
      } catch {
        portablePersistent = false;
      }
    }
    if (globalThis.MRAAuth) {
      try {
        await globalThis.MRAAuth.saveCloudEvents([event]);
      } catch (e) {
        console.warn("Answer saved locally; cloud sync will retry on next sign-in/load.", e);
      }
    }
    return portableResponse({ event });
  }
  return globalThis.fetch(url, options);
};

