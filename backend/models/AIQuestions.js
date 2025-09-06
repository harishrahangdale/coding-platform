// models/AIQuestions.js
const mongoose = require("mongoose");

// Define a schema for test cases
const testCaseSchema = new mongoose.Schema(
  {
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

    sampleInput: { type: String, default: "" },
    sampleOutput: { type: String, default: "" },

    testCases: { type: [testCaseSchema], default: [] },

    timeLimit: { type: Number, default: 5 },     // seconds
    memoryLimit: { type: Number, default: 256 },  // MB
    maxCodeSize: { type: Number, default: 1024 }, // KB
    timeAllowed: { type: Number, required: true, default: 15 }, // minutes

    maxAttempts: { type: Number, default: 3 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AIQuestions", questionSchema);