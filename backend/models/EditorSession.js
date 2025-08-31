// models/EditorSession.js
const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema({
  t: { type: Number, required: true }, 
  type: { 
    type: String, 
    enum: ["change", "cursor", "selection", "pause", "run_result"], 
    required: true 
  },

  // code editing
  range: Object,
  text: String,
  rangeLength: Number,
  versionId: Number,
  position: Object,
  selection: Object,

  // run & pause
  status: { 
    type: String, 
    enum: ["passed", "compile_error", "runtime_error", "failed", "pause"], 
  },
  message: { type: String },
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