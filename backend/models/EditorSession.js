// models/EditorSession.js
const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema({
  t: Number, // timestamp (ms)
  type: { type: String, enum: ["change", "cursor", "selection"] },
  range: Object,       // for change
  text: String,        // inserted text
  rangeLength: Number, // deleted chars
  versionId: Number,
  position: Object,    // { lineNumber, column }
  selection: Object,   // { startLineNumber, ... }
}, { _id: false });

const editorSessionSchema = new mongoose.Schema({
  sessionId: { type: String, unique: true, index: true },
  candidate_id: { type: String, index: true },
  screening_test_id: { type: String, index: true },
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: "Question", index: true },
  languageId: Number,
  events: { type: [eventSchema], default: [] },
}, { timestamps: true });

module.exports = mongoose.model("EditorSession", editorSessionSchema);