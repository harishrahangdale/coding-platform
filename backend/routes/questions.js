// routes/questions.js
const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");

const Question = require("../models/Question");
const Scaffold = require("../models/Scaffold");

const router = express.Router();

// --- Storage ---
const upload = multer({
  dest: path.join(process.cwd(), "uploads"),
  limits: { fileSize: 20 * 1024 * 1024 }, // allow up to 20MB to be safe for zips
});

// --- Helpers ---
const parseMaybeJSON = (v, fallback) => {
  if (v == null) return fallback;
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return fallback; }
};

const parseList = (v) => {
  if (v == null) return [];
  if (typeof v !== "string") return Array.isArray(v) ? v : [v];
  const s = v.trim();
  if (!s) return [];
  if (s.startsWith("[") || s.startsWith("{")) return parseMaybeJSON(s, []);
  return s.split(",").map(x => x.trim());
};

const cleanupFiles = (files = []) => {
  for (const f of files) {
    if (!f?.path) continue;
    fs.promises.unlink(f.path).catch(() => {});
  }
};

const readText = (fp) => {
  try { return fs.readFileSync(fp, "utf-8"); } catch { return ""; }
};

const buildCasesFromFiles = ({
  inputFiles = [],
  outputFiles = [],
  meta = [],
  scores = [],
  explanations = [],
  visibles = [],
}) => {
  const n = Math.min(inputFiles.length, outputFiles.length);
  const cases = [];
  for (let i = 0; i < n; i++) {
    const inF = inputFiles[i];
    const outF = outputFiles[i];
    const m = meta[i] || {};
    const score = Number(m.score ?? scores[i] ?? 1);
    const explanation = String(m.explanation ?? explanations[i] ?? "");
    const visible = Boolean(
      m.visible ??
      (typeof visibles[i] === "string" ? /^(1|true|yes)$/i.test(visibles[i]) : visibles[i])
    );
    cases.push({
      input: readText(inF.path),
      output: readText(outF.path),
      score: Number.isFinite(score) ? score : 1,
      explanation,
      visible,
    });
  }
  return cases;
};

// --- ZIP parsing ---
// Normalize a filename to a {base, kind} where kind is 'in' or 'out' if recognized, else null.
const classifyZipName = (filename) => {
  const name = filename.replace(/\\/g, "/"); // windows paths in zip
  const base = path.basename(name);
  const lower = base.toLowerCase();

  // strip extensions and detect kind by suffix/extension
  // Supported:
//  - *.in / *.out
//  - *.in.txt / *.out.txt
//  - *.input.txt / *.output.txt
  if (/\.(in|out)$/.test(lower)) {
    const stem = lower.replace(/\.(in|out)$/, "");
    const kind = lower.endsWith(".in") ? "in" : "out";
    return { base: stem, kind };
  }
  if (/\.in\.txt$/.test(lower)) {
    return { base: lower.replace(/\.in\.txt$/, ""), kind: "in" };
  }
  if (/\.out\.txt$/.test(lower)) {
    return { base: lower.replace(/\.out\.txt$/, ""), kind: "out" };
  }
  if (/\.input\.txt$/.test(lower)) {
    return { base: lower.replace(/\.input\.txt$/, ""), kind: "in" };
  }
  if (/\.output\.txt$/.test(lower)) {
    return { base: lower.replace(/\.output\.txt$/, ""), kind: "out" };
  }

  return { base: null, kind: null };
};

const buildCasesFromZip = (zipPath, metaArr = []) => {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();

  // Collect by normalized base
  const inputs = new Map();  // base -> string
  const outputs = new Map(); // base -> string

  for (const e of entries) {
    if (e.isDirectory) continue;
    const { base, kind } = classifyZipName(e.entryName);
    if (!base || !kind) continue;

    const content = e.getData().toString("utf-8");
    if (kind === "in") inputs.set(base, content);
    else if (kind === "out") outputs.set(base, content);
  }

  // Pair by common base (sorted for stable order)
  const bases = [...new Set([...inputs.keys()].filter(b => outputs.has(b)))].sort();

  const cases = [];
  for (let i = 0; i < bases.length; i++) {
    const b = bases[i];
    const meta = metaArr[i] || {};
    const score = Number(meta.score ?? 1);
    const explanation = String(meta.explanation ?? "");
    const visible =
      typeof meta.visible === "string"
        ? /^(1|true|yes)$/i.test(meta.visible)
        : Boolean(meta.visible);

    cases.push({
      input: inputs.get(b) || "",
      output: outputs.get(b) || "",
      score: Number.isFinite(score) ? score : 1,
      explanation,
      visible,
    });
  }

  return cases;
};

// --- ROUTE: Create Question (multipart) ---
router.post(
  "/questions",
  upload.fields([
    { name: "sampleInput", maxCount: 1 },
    { name: "sampleOutput", maxCount: 1 },
    { name: "testInputs", maxCount: 200 },   // per-file mode
    { name: "testOutputs", maxCount: 200 },  // per-file mode
    { name: "testZip", maxCount: 1 },        // NEW: zip mode
  ]),
  async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    const sampleInputFile = req.files?.sampleInput?.[0];
    const sampleOutputFile = req.files?.sampleOutput?.[0];
    const testInputFiles = req.files?.testInputs || [];
    const testOutputFiles = req.files?.testOutputs || [];
    const testZipFile = req.files?.testZip?.[0];

    try {
      const {
        title,
        description,
        difficulty,
        tags,
        timeLimit,
        memoryLimit,
        maxCodeSize,
        timeAllowed,
        maxAttempts,
        testCases,     // JSON array (text mode)
        scaffolds,     // JSON array
        // Optional meta for file/zip modes:
        testMeta,          // JSON array parallel to files or zip-pairs
        testScores,        // comma/JSON list (fallback for file mode)
        testExplanations,  // comma/JSON list
        testVisibles,      // comma/JSON list
      } = req.body;

      if (!title || !difficulty) {
        return res.status(400).json({ error: "title and difficulty are required" });
      }

      // Tags
      let tagsArr = [];
      if (typeof tags === "string" && tags.trim().length) {
        if (tags.trim().startsWith("[")) tagsArr = parseMaybeJSON(tags, []);
        else tagsArr = tags.split(",").map(t => t.trim()).filter(Boolean);
      } else if (Array.isArray(tags)) {
        tagsArr = tags;
      }

      // Sample I/O
      const sampleInput = sampleInputFile ? readText(sampleInputFile.path) : "";
      const sampleOutput = sampleOutputFile ? readText(sampleOutputFile.path) : "";

      // ---------- Gather test cases from all sources ----------
      // Text mode
      const fromText = (() => {
        const arr = parseMaybeJSON(testCases, []);
        if (!Array.isArray(arr)) return [];
        return arr.map((t) => ({
          input: String(t.input ?? ""),
          output: String(t.output ?? ""),
          score: Number(t.score ?? 1),
          explanation: String(t.explanation ?? ""),
          visible: Boolean(t.visible ?? false),
        }));
      })();

      // Per-file mode
      const fromFiles = (() => {
        if (!testInputFiles.length && !testOutputFiles.length) return [];
        const metaArr = parseMaybeJSON(testMeta, []);
        const scoresArr = parseList(testScores);
        const explanationsArr = parseList(testExplanations);
        const visiblesArr = parseList(testVisibles);
        return buildCasesFromFiles({
          inputFiles: testInputFiles,
          outputFiles: testOutputFiles,
          meta: Array.isArray(metaArr) ? metaArr : [],
          scores: scoresArr,
          explanations: explanationsArr,
          visibles: visiblesArr,
        });
      })();

      // Zip mode
      const fromZip = (() => {
        if (!testZipFile) return [];
        const metaArr = parseMaybeJSON(testMeta, []);
        return buildCasesFromZip(testZipFile.path, Array.isArray(metaArr) ? metaArr : []);
      })();

      const allCases = [...fromText, ...fromFiles, ...fromZip];

      // Basic validation/normalization
      for (const [i, c] of allCases.entries()) {
        if (typeof c.input !== "string" || typeof c.output !== "string") {
          return res.status(400).json({ error: `testCases[${i}] must include input and output` });
        }
        if (!Number.isFinite(c.score)) c.score = 1;
        if (c.score < 0) c.score = 0;
        c.explanation = String(c.explanation ?? "");
        c.visible = Boolean(c.visible);
      }

      const qDoc = await Question.create([{
        title: String(title),
        description: String(description ?? ""),
        difficulty: String(difficulty),
        tags: tagsArr,
        sampleInput,
        sampleOutput,
        testCases: allCases,
        timeLimit: timeLimit != null ? Number(timeLimit) : 5,
        memoryLimit: memoryLimit != null ? Number(memoryLimit) : 256,
        maxCodeSize: maxCodeSize != null ? Number(maxCodeSize) : 1024,
        timeAllowed: timeAllowed != null ? Number(timeAllowed) : 15,
        maxAttempts: maxAttempts != null ? Number(maxAttempts) : 3,
      }], { session });

      const questionId = qDoc[0]._id;

      const parsedScaffolds = parseMaybeJSON(scaffolds, []);
      if (!Array.isArray(parsedScaffolds)) {
        await session.abortTransaction();
        return res.status(400).json({ error: "scaffolds must be an array" });
      }
      if (parsedScaffolds.length) {
        const scaffoldDocs = parsedScaffolds.map((s) => {
          if (s.languageId == null || s.languageName == null) {
            throw new Error("Each scaffold requires languageId and languageName");
          }
          return {
            questionId,
            languageId: Number(s.languageId),
            languageName: String(s.languageName),
            body: String(s.body ?? ""),
          };
        });
        await Scaffold.insertMany(scaffoldDocs, { session });
      }

      await session.commitTransaction();
      res.status(201).json({
        message: "Question created successfully",
        questionId,
        testCasesInserted: allCases.length,
        scaffoldsInserted: parsedScaffolds.length || 0,
        mode: {
          fromText: fromText.length,
          fromFiles: fromFiles.length,
          fromZip: fromZip.length,
        },
      });
    } catch (err) {
      await session.abortTransaction();
      console.error("Insert Question Error:", err);
      res.status(500).json({ error: "Failed to create question", details: err.message });
    } finally {
      const all = []
        .concat(sampleInputFile ? [sampleInputFile] : [])
        .concat(sampleOutputFile ? [sampleOutputFile] : [])
        .concat(testInputFiles)
        .concat(testOutputFiles)
        .concat(req.files?.testZip || []);
      cleanupFiles(all);
      session.endSession();
    }
  }
);

module.exports = router;