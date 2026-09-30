/* Load the editable module files and the shared math/image libraries.
 * Question IDs are stable: the progress store never uses file paths.
 */
async function loadQuestionBank(readJson = readBankJson) {
  const manifest = await readJson("manifest.json");
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.modules)) {
    throw new Error("Unsupported question manifest.");
  }

  const [catalog, images, mathLibrary, ...modules] = await Promise.all([
    readJson(manifest.catalog),
    readJson(manifest.images),
    readJson(manifest.math),
    ...manifest.modules.map((module) => readJson(module.path)),
  ]);

  const mathById = new Map();
  for (const question of mathLibrary.questions) {
    if (mathById.has(question.id)) {
      throw new Error(
        "Invalid or duplicate shared math question: " + question.id,
      );
    }
    mathById.set(question.id, question);
  }

  const questions = new Map();
  const moduleIds = new Set();
  for (const [index, module] of modules.entries()) {
    const entry = manifest.modules[index];
    if (
      moduleIds.has(entry.id) ||
      module.world !== entry.world ||
      module.topic !== entry.topic
    ) {
      throw new Error("Module metadata does not match manifest: " + entry.path);
    }
    moduleIds.add(entry.id);
    const assignment = { world: entry.world, topic: entry.topic };

    for (const question of module.questions) {
      if (questions.has(question.id) || mathById.has(question.id)) {
        throw new Error("Duplicate question ID: " + question.id);
      }
      if (
        question.world !== module.world ||
        question.topic !== module.topic ||
        question.type === "formula"
      ) {
        throw new Error(
          "Question belongs in another module or the math library: " +
            question.id,
        );
      }
      questions.set(question.id, {
        ...question,
        moduleAssignments: [assignment],
      });
    }

    const seenMath = new Set();
    for (const id of module.mathQuestionIds) {
      const question = mathById.get(id);
      if (!question || seenMath.has(id))
        throw new Error("Invalid math reference in " + entry.path + ": " + id);
      seenMath.add(id);
      if (questions.has(id))
        questions.get(id).moduleAssignments.push(assignment);
      else questions.set(id, { ...question, moduleAssignments: [assignment] });
    }
  }

  for (const id of mathById.keys()) {
    if (!questions.has(id))
      throw new Error("Shared math question has no module assignment: " + id);
  }
  for (const question of questions.values())
    validateQuestion(question, images, catalog);
  return {
    ...catalog,
    questions: [...questions.values()],
    slideImages: images,
  };
}

async function readBankJson(path) {
  const response = await globalThis.fetch("./" + path, { cache: "no-cache" });
  if (!response.ok)
    throw new Error(
      "Could not load " + path + ". Check that all v14 files were uploaded.",
    );
  return response.json();
}

function validateQuestion(question, images, catalog) {
  if (!question.id || !catalog.sources[question.source])
    throw new Error("Missing ID or source: " + question.id);
  for (const variation of [{}, ...(question.variants || [])]) {
    const form = { ...question, ...variation };
    if (
      !form.prompt ||
      !form.explanation ||
      !Array.isArray(form.options) ||
      new Set(form.options).size !== form.options.length ||
      form.options.filter((option) => option === form.answer).length !== 1
    ) {
      throw new Error("Invalid question or answer choices: " + question.id);
    }
    if (form.diagram && !images[form.diagram.imageKey])
      throw new Error("Missing image: " + question.id);
    if (
      form.numeric !== undefined &&
      (!Number.isFinite(form.numeric) || !Number.isFinite(form.tolerance))
    ) {
      throw new Error("Invalid numeric answer or tolerance: " + question.id);
    }
  }
}
