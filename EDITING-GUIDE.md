# MRA Study — editing guide

This folder is the website source of truth. Edit these files; do not edit the old
`app/bank.json`, `game/`, or earlier version folders for v14.

## Where things live

| File | What to edit |
| --- | --- |
| `questions/c202/module-1/question.json` | C-202 Module 1 safety questions |
| `questions/c202/module-3/question.json` | C-202 transformer questions and math references |
| `questions/c205/module-1/question.json` | C-205 Module 1 questions |
| `questions/shared/math.json` | All math questions, stored once |
| `manifest.json` | List of module files, with course and module titles |
| `catalog.json` | Course names, descriptions, topic order and source titles |
| `images.json` | Shared original diagram images (usually leave this alone) |
| `review-slides/` | Shared full-slide JPGs shown after wrong answers |
| `bank-loader.js` | Reading and validating the module files |
| `storage.js` | Answer grading and browser progress storage |
| `game.js` | Tests, course selection, feedback and UI interactions |
| `style.css` | Appearance and mobile layout |
| `index.html` | Entry page and script loading order |

Courses without numbered modules use `section-01`, `section-02`, etc. The exact
human-readable title is inside each file and in `manifest.json`. C-201 keeps the
slide numbering, including its jump from Module 3 to Module 5.

## Edit an ordinary question

Open that module's `question.json`. Its `questions` array contains only that
module's non-math questions. Change `prompt`, `options`, `answer`, `explanation`
and `reviewCue` as needed. Use double quotes and valid JSON, without comments or
trailing commas. `answer` must exactly match one item in `options`.

Keep an existing question's `id` unchanged: saved progress uses it. New questions
need a new unique ID. Preserve `world`, `topic`, source/page references and
`reviewSlides` when they still apply. Variants can override prompt, choices,
answer, explanation and numeric values; check every variant when changing one.

`explanation` explains why the answer is correct. `reviewCue.text` tells the
learner what to find on the slide. `diagram.imageKey` identifies a cropped image
from `images.json`; `reviewSlides` points to full slide images.

## Shared math: opt-in by module

The actual question is in `questions/shared/math.json`. The module includes only
its ID in `mathQuestionIds`, for example:

```json
"mathQuestionIds": ["calc-turns", "calc-secondary"]
```

An empty list means no shared math in that module. Never copy the full math
question into a module's ordinary questions. A math ID can be referenced by
multiple modules when the same skill really belongs in each. It is still one
question and one progress record, and appears at most once in a test. Its saved
`world` and `topic` identify its original source context; module references
determine where it is available. Keep the explanation and review slides relevant
to every assigned module. No new cross-course math assignments were inferred
during migration: all original assignments were preserved.

For numeric questions keep `numeric`, `unit`, `tolerance`, `answer`, `options`
and any `variants` consistent. A missing math reference or image stops loading
with an error identifying the question or file instead of silently dropping it.

## Test behavior

- Simple Test uses checked modules and category filters, with 5, 10, 15, 20 or All
  questions and immediate feedback. Smaller concept pools produce shorter sessions.
- Boss uses the whole selected course regardless of practice filters: 40 questions,
  aiming for 32–36 teacher questions. A preview shows shortages and the actual mix
  before starting. 75% passes. No repeats or unrelated courses are added.
- Shared math only enters the modules which list it.
- The final mixed-course SACA arena has been removed.
- Existing question IDs, progress key and module checkbox preferences are retained.

## Categories and teaching aids

Each question has a `category`: `Identify`, `Understand`, `Apply`, `Calculate`, or
`Troubleshoot`. `conceptKey` groups narrowly equivalent questions for practice
spacing; use the same key only for questions teaching the same specific fact.
Different conditions on the same circuit are usually different concepts. All
includes every eligible question; shorter practice sessions use one sibling per
concept and rotate siblings between sessions. Boss keeps its teacher quota.

`learningHelpKey` selects an original plain-language teaching aid in
`study-content.js`. Optional `learningHelp` can override it with `simple`,
`example`, `memory`, and `lookFor` strings. Optional `wrongAnswerExplanations`
maps exact wrong option text to a definition or explanation. Keep these tied to
the course material, and check variants when adding them. Without a tailored aid,
feedback uses the question's existing explanation and a walkthrough of that
question rather than inventing a new explanation for an unknown distractor.

`study-tools.js` handles practice preferences, Boss previews, personal bookmarks,
flashcard ratings and skill labels. These preferences use separate browser keys;
they do not replace the graded progress history or teacher stars. Again prioritizes
a card next session, Hard after one day, Easy after seven days. Ratings are unscored.
Skill labels use latest answer evidence and coverage, not XP alone. No Due today
feature is included.

## Validate and publish

From `website-project`, run `node work/test-v14.mjs`, then
`node work/build-v14.mjs`. The build copies this folder to `outputs/website-v14`.
No old monolithic bank is used or regenerated.

Upload the contents of `outputs/website-v14` into the GitHub repository root:
`index.html`, `game.js`, `style.css`, `storage.js`, `bank-loader.js`,
`manifest.json`, `catalog.json`, `questions/`, `images.json`, and `review-slides/`.
Keep folder paths intact. Existing images/review slides may be reused if identical.
The old root `questions.json` and `editor.js` are no longer loaded; leaving them
in GitHub will not affect v14. After migration, a question edit usually requires
uploading only the one module file (and shared math or images if you changed them).

Use GitHub Pages or a local HTTP server to run this multi-file version. Opening
`index.html` as a local file may block JSON loading. No account/admin access or
new dependency is needed by website users.
