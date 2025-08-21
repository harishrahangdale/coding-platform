// models/Question.js
const mongoose = require("mongoose");

// Define a schema for test cases
// Allow empty strings; coerce null/undefined to ""
// This ensures that if input/output is not provided, it defaults to an empty string
// This is useful for cases where the test case might not have an input or output defined.
const testCaseSchema = new mongoose.Schema(
  {
    // Allow empty strings; coerce null/undefined to ""
    input:  { type: String, default: "", set: v => (v == null ? "" : String(v)) },
    output: { type: String, default: "", set: v => (v == null ? "" : String(v)) },
    score: { type: Number, default: 1 },
    explanation: { type: String, default: "" },
    visible: { type: Boolean, default: false },
  },
  { _id: false }
);

const questionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: "" },
    difficulty: { type: String, enum: ["Easy", "Medium", "Hard"], required: true },
    tags: { type: [String], default: [] },

    // Display-only examples
    sampleInput: { type: String, default: "" },
    sampleOutput: { type: String, default: "" },

    // Hidden, scored test cases
    testCases: { type: [testCaseSchema], default: [] },

    // Execution settings (per run)
    timeLimit: { type: Number, default: 5 },     // seconds
    memoryLimit: { type: Number, default: 256 },  // MB
    maxCodeSize: { type: Number, default: 1024 }, // KB
    timeAllowed: { type: Number, required: true, default: 15 }, // per-question duration (minutes)

    // Admin/candidate policy
    maxAttempts: { type: Number, default: 3 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Question", questionSchema);