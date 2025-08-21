// routes/questions.js
const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const Question = require("../models/Question"); // from earlier
const Scaffold = require("../models/Scaffold"); // updated: languageId + languageName

const router = express.Router();

// Basic file storage (temp). You can switch to memoryStorage if you prefer buffers.
const upload = multer({
  dest: path.join(process.cwd(), "uploads"),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per your UI
});

// Helpers
const parseMaybeJSON = (v, fallback) => {
  if (v == null) return fallback;
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return fallback; }
};

const cleanupFiles = (files = []) => {
  for (const f of files) {
    if (!f?.path) continue;
    fs.promises.unlink(f.path).catch(() => {});
  }
};

// POST /api/questions  (multipart/form-data)
// Fields:
// - Body fields: title, description, difficulty, tags (comma or JSON array),
//   timeLimit, memoryLimit, maxCodeSize, timeAllowed, maxAttempts, testCases (JSON), scaffolds (JSON)
// - Files: sampleInput (txt), sampleOutput (txt)
router.post(
  "/questions",
  upload.fields([{ name: "sampleInput", maxCount: 1 }, { name: "sampleOutput", maxCount: 1 }]),
  async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    // Track temp files for cleanup
    const sampleInputFile = req.files?.sampleInput?.[0];
    const sampleOutputFile = req.files?.sampleOutput?.[0];

    try {
      const {
        title,
        description,
        difficulty, // "Easy" | "Medium" | "Hard"
        tags,       // "java,arrays" OR '["java","arrays"]'
        timeLimit,  // seconds
        memoryLimit, // MB
        maxCodeSize, // KB
        timeAllowed, // minutes
        maxAttempts, // number
        testCases,   // JSON array: [{input,output,score,explanation?,visible?}]
        scaffolds    // JSON array: [{languageId:number, languageName:string, body:string}]
      } = req.body;

      if (!title || !difficulty) {
        return res.status(400).json({ error: "title and difficulty are required" });
      }

      // Parse tags
      let tagsArr = [];
      if (typeof tags === "string" && tags.trim().length) {
        if (tags.trim().startsWith("[")) tagsArr = parseMaybeJSON(tags, []);
        else tagsArr = tags.split(",").map(t => t.trim()).filter(Boolean);
      } else if (Array.isArray(tags)) {
        tagsArr = tags;
      }

      // Sample I/O
      const sampleInput = sampleInputFile
        ? fs.readFileSync(sampleInputFile.path, "utf-8")
        : "";
      const sampleOutput = sampleOutputFile
        ? fs.readFileSync(sampleOutputFile.path, "utf-8")
        : "";

      // Test cases (parsed)
      const parsedTestCases = parseMaybeJSON(testCases, []);
      if (!Array.isArray(parsedTestCases)) {
        return res.status(400).json({ error: "testCases must be an array" });
      }
      // Minimal normalization
      const tc = parsedTestCases.map((t) => ({
        input: String(t.input ?? ""),
        output: String(t.output ?? ""),
        score: Number(t.score ?? 1),
        explanation: String(t.explanation ?? ""),
        visible: Boolean(t.visible ?? false),
      }));

      // Create Question
      const qDoc = await Question.create([{
        title: String(title),
        description: String(description ?? ""),
        difficulty: String(difficulty),
        tags: tagsArr,
        sampleInput,
        sampleOutput,
        testCases: tc,
        timeLimit: timeLimit != null ? Number(timeLimit) : 5,
        memoryLimit: memoryLimit != null ? Number(memoryLimit) : 256,
        maxCodeSize: maxCodeSize != null ? Number(maxCodeSize) : 1024,
        timeAllowed: timeAllowed != null ? Number(timeAllowed) : 15,
        maxAttempts: maxAttempts != null ? Number(maxAttempts) : 3,
      }], { session });

      const questionId = qDoc[0]._id;

      // Scaffolds (parsed)
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
        scaffoldsInserted: parsedScaffolds.length || 0,
      });
    } catch (err) {
      await session.abortTransaction();
      console.error("Insert Question Error:", err);
      res.status(500).json({ error: "Failed to create question", details: err.message });
    } finally {
      session.endSession();
      cleanupFiles([sampleInputFile, sampleOutputFile]);
    }
  }
);

module.exports = router;