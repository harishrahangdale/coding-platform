// backend/scripts/generate_questions_gemini.js
/*
  Two-step generator (topics -> 1 question per topic)
  - Strong anti-duplication: DB unique index (case-insensitive) + in-memory fuzzy dedupe
  - Sends forbidden / seen titles to the model to avoid repeats
  - PREVIEW mode (default true) to avoid DB writes while tuning
  - Robust JSON extraction + logging
*/

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const axios = require('axios');
const mongoose = require('mongoose');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const Question = require('../models/AIQuestions'); // adjust path if needed

// Config from .env
const API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/qbank';
const INPUT_FILE = process.env.INPUT_FILE || 'questions.xlsx';
const SHEET_NAME = process.env.SHEET_NAME || null;
const BATCH_SIZE = Number(process.env.BATCH_SIZE || 1); // how many questions to attempt per loop (after topics)
const TOTAL_TO_GENERATE = Number(process.env.TOTAL_TO_GENERATE || 100);
const TOPICS_PER_ROUND = Number(process.env.TOPICS_PER_ROUND || 12); // how many topics to ask per round
const MAX_RETRIES = Number(process.env.MAX_RETRIES || 3);
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;
const PREVIEW = (process.env.PREVIEW || 'true').toLowerCase() === 'true';

// logs
const LOG_DIR = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// AJV schema for validation (matches your Question model)
const questionJsonSchema = {
  type: 'object',
  properties: {
    title: { type: 'string', minLength: 1 },
    description: { type: 'string' },
    difficulty: { type: 'string', enum: ['Easy', 'Medium', 'Hard'] },
    tags: { type: 'array', items: { type: 'string' } },
    sampleInput: { type: 'string' },
    sampleOutput: { type: 'string' },
    testCases: {
      type: 'array',
      minItems: 3,
      maxItems: 5,
      items: {
        type: 'object',
        properties: {
          input: { type: 'string' },
          output: { type: 'string' },
          score: { type: 'number' },
          explanation: { type: 'string' },
          visible: { type: 'boolean' }
        },
        required: ['input','output','score','explanation','visible']
      }
    },
    timeLimit: { type: 'number' },
    memoryLimit: { type: 'number' },
    maxCodeSize: { type: 'number' },
    timeAllowed: { type: 'number' },
    maxAttempts: { type: 'number' }
  },
  required: ['title','description','difficulty','tags','sampleInput','sampleOutput','testCases','timeLimit','memoryLimit','maxCodeSize','timeAllowed','maxAttempts']
};
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateQuestion = ajv.compile(questionJsonSchema);

// ---------- Utility helpers ----------
function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

function healJsonString(str) {
  if (!str || typeof str !== 'string') return str;
  let s = str;
  s = s.replace(/```json\s*/gi, '').replace(/```/g, '');
  s = s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  s = s.replace(/\r\n/g, '\n');
  s = s.replace(/[\u0000-\u0019]+/g, ' ');
  s = s.replace(/,\s*([}\]])/g, '$1');
  s = s.replace(/(\{|,)(\s*)([a-zA-Z0-9_\-]+)\s*:/g, '$1 $2"$3":');
  return s.trim();
}

function extractFirstBalancedArray(text) {
  if (!text || typeof text !== 'string') return null;
  const start = text.indexOf('[');
  if (start === -1) return null;
  let depth = 0, inString = false, escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\\\') { escape = true; continue; }
    if (ch === '"') inString = !inString;
    if (!inString) {
      if (ch === '[') depth++;
      else if (ch === ']') { depth--; if (depth === 0) return text.slice(start, i+1); }
    }
  }
  // auto-close if truncated
  let openCount = 0;
  for (let i = start; i < text.length; i++) { if (text[i] === '[') openCount++; else if (text[i] === ']') openCount--; }
  if (openCount > 0) return text.slice(start) + (']'.repeat(openCount));
  return null;
}

// Excel read
function readQuestionsFromExcel(filePath, sheetName = null) {
  if (!fs.existsSync(filePath)) { console.error('Seed Excel not found at', filePath); return []; }
  const wb = xlsx.readFile(filePath);
  const sn = sheetName || wb.SheetNames[0];
  const sheet = wb.Sheets[sn];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
  if (!rows || rows.length === 0) return [];
  const firstRow = rows[0] || {};
  const keys = Object.keys(firstRow);
  const qCol = keys.find(k => k.toLowerCase().includes('question')) || keys[0];
  return rows.map(r => (r[qCol] || '').toString().trim()).filter(Boolean);
}

// Minimal Gemini body (compatible with API)
function buildMinimalGeminiBody(textPrompt) {
  return { contents: [ { role: 'user', parts: [ { text: textPrompt } ] } ] };
}

async function callLLM_Gemini(prompt) {
  if (!API_KEY) throw new Error('GEMINI_API_KEY not set in .env');
  const body = buildMinimalGeminiBody(prompt);
  const res = await axios.post(GEMINI_URL, body, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 120000
  });
  return res.data;
}

function responseDataToText(data) {
  if (!data) return '';
  if (data.candidates && Array.isArray(data.candidates) && data.candidates.length) {
    const cand = data.candidates[0];
    // collect text parts
    const parts = [];
    function gather(node) {
      if (!node) return;
      if (Array.isArray(node.parts)) {
        for (const p of node.parts) {
          if (p && typeof p.text === 'string') parts.push(p.text);
          else if (p && p.aggregateText) parts.push(p.aggregateText);
        }
      } else if (Array.isArray(node)) node.forEach(gather);
      else if (node && node.text) parts.push(node.text);
    }
    gather(cand.content);
    if (parts.length) return parts.join('\n');
    if (cand.outputText) return cand.outputText;
  }
  if (data.output && Array.isArray(data.output) && data.output.length) {
    const out = data.output[0];
    if (out && out.content && Array.isArray(out.content) && out.content[0] && out.content[0].text) return out.content[0].text;
  }
  if (data.text) return data.text;
  return typeof data === 'string' ? data : JSON.stringify(data);
}

// small retry wrapper
async function retry(fn, opts = {}) {
  const retries = typeof opts.retries === 'number' ? opts.retries : 2;
  const minDelay = typeof opts.minDelayMs === 'number' ? opts.minDelayMs : 500;
  let attempt = 0;
  while (true) {
    try { return await fn(); }
    catch (err) {
      attempt++;
      if (attempt > retries) throw err;
      const delay = Math.round(minDelay * Math.pow(1.8, attempt) + Math.random() * 300);
      console.warn(`Retry ${attempt}/${retries} after ${delay}ms...`);
      await sleep(delay);
    }
  }
}

// ---------- Duplicate detection ----------
async function ensureUniqueTitleIndex() {
  try {
    await Question.collection.createIndex({ title: 1 }, { unique: true, collation: { locale: 'en', strength: 2 }, background: true });
    console.log('Ensured unique index on Question.title (case-insensitive)');
  } catch (err) {
    console.warn('Could not create unique index (may already exist or duplicates present):', err.message);
  }
}
function normalizeTitle(s) { return (s || '').toString().trim().toLowerCase().replace(/\s+/g, ' '); }
function levenshtein(a,b) {
  if (a===b) return 0;
  const la = a.length, lb = b.length;
  if (la===0) return lb;
  if (lb===0) return la;
  const dp = Array.from({ length: la+1 }, () => new Array(lb+1).fill(0));
  for (let i=0;i<=la;i++) dp[i][0] = i;
  for (let j=0;j<=lb;j++) dp[0][j] = j;
  for (let i=1;i<=la;i++) for (let j=1;j<=lb;j++) {
    const cost = a[i-1] === b[j-1] ? 0 : 1;
    dp[i][j] = Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+cost);
  }
  return dp[la][lb];
}
function isFuzzyDuplicate(candidateTitle, existingNormalizedTitles, thresholdRatio = 0.18) {
  const candNorm = normalizeTitle(candidateTitle);
  const candLen = Math.max(1, candNorm.length);
  for (const ex of existingNormalizedTitles) {
    if (!ex) continue;
    if (ex[0] !== candNorm[0]) continue; // quick reject
    const dist = levenshtein(candNorm, ex);
    const ratio = dist / Math.max(candLen, ex.length);
    if (ratio <= thresholdRatio) return true;
  }
  return false;
}

// ---------- Topic generation prompt ----------
// Biased towards arrays & strings (service-company staples) and explicitly excludes hard topics
async function generateTopics(seedSnippet, askCount = 12) {
  // Prioritize service-company favourites: arrays, strings and their common patterns.
  // Weighting: ~60% arrays/strings, ~25% hashing & sorting, ~15% others (two-pointers, sliding-window, stack/queue, linked-list, bitwise/math, basic SQL, regex, small OOP).
  // EXCLUDE: graphs, trees, complex DP, heavy system-design, multithreading/concurrency.
  const prompt = `You are an interviewer brainstorming short, highly relevant interview TOPICS (not full problems) that are commonly asked at service-based companies (e.g., Infosys, TCS, Wipro, Accenture).
Return a JSON array of ${askCount} short topic titles (3-7 words each). Prefer topics from these categories (in order of preference):
arrays, strings, hashing/hashmap, sorting, two-pointers, sliding-window, stack/queue, linked-list, bitwise/math puzzles, basic SQL queries, regex, small OOP design tasks.
Do NOT generate graph, tree, complex DP, heavy system-design, or multithreading/concurrency topics (we rarely ask those for this product).
Also DO NOT produce topics about logs, invoices, employees, API payload parsing, record aggregation, or other domain-aggregation chores.
Do NOT include full problems—only concise topic titles. Output ONLY a JSON array. Seed examples (style-only):\n${seedSnippet.slice(0,6).map((s,i)=>`${i+1}. ${s}`).join('\n')}`;
  const res = await retry(() => callLLM_Gemini(prompt), { retries: MAX_RETRIES, minDelayMs: 700 });
  const txt = responseDataToText(res);
  fs.writeFileSync(path.join(LOG_DIR, `topics_raw_${Date.now()}.txt`), txt, 'utf8');

  let arrStr = extractFirstBalancedArray(txt) || healJsonString(txt);
  if (!arrStr) {
    // fallback: return non-empty lines
    return txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, askCount);
  }

  try {
    const parsed = JSON.parse(arrStr);
    if (Array.isArray(parsed)) return parsed.map(t => (''+t).trim()).filter(Boolean).slice(0, askCount);
  } catch (e) { /* fallthrough to line extraction */ }

  // last-resort: strip brackets/quotes and return lines
  const lines = arrStr.replace(/[\[\]"]+/g, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  return lines.slice(0, askCount);
}

// ---------- Single-topic question prompt builder ----------
function buildPromptForTopic(topic, forbiddenTitles = [], reqCount = 1) {
  const forbid = (forbiddenTitles && forbiddenTitles.length)
    ? `Do NOT reuse or paraphrase these titles (exact or paraphrase): ${JSON.stringify(forbiddenTitles.slice(0,200))}.`
    : '';

  return `You are an expert technical interviewer. Create EXACTLY ${reqCount} programming question(s) for the TOPIC: \"${topic}\".
Output MUST be a single JSON array (no markdown, no commentary). Each item MUST include ALL fields:
- title (<=80 chars)
- description (1-3 concise sentences)
- difficulty ("Easy"|"Medium"|"Hard")
- tags (array of strings; include topic & role hint like backend/frontend/qa/devops and experience hint like junior/mid/senior)
- sampleInput (string) and sampleOutput (string)
- testCases (3-5 objects) each with: input (string), output (string), score (number), explanation (1 line), visible (boolean). At least one test case must have visible:true.
- timeLimit (seconds), memoryLimit (MB), maxCodeSize (KB), timeAllowed (minutes), maxAttempts (number)

CONSTRAINTS:
- Focus on service-company style problems: strings, arrays and closely related patterns (hashmap, sorting, two-pointers, sliding-window, stacks/queues, linked-lists, bitwise/math puzzles, basic SQL, regex, short OOP).
- EXCLUDE hard/complex topics: graphs, trees, complex DP, heavy system-design, and concurrency/multithreading topics.
- Be original; do not copy full existing problems. Do not paraphrase any title in the forbidden list.
- Keep description concise and test-case explanations to one line.
${forbid}
Return strict JSON only.`;
}

// ---------- Main generation flow ----------
async function main() {
  console.log('Reading input file:', INPUT_FILE);
  const seeds = readQuestionsFromExcel(INPUT_FILE, SHEET_NAME);
  console.log(`Found ${seeds.length} seed questions.`);
  if (seeds.length === 0) { console.error('No seed questions found. Put questions in', INPUT_FILE); process.exit(1); }

  // Connect to DB
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('Mongo connection failed:', err && err.message ? err.message : err);
    process.exit(1);
  }

  // create unique index & preload existing titles
  await ensureUniqueTitleIndex();
  const existingDocs = await Question.find({}, { title: 1 }).lean().catch(()=>[]);
  const existingTitleSet = new Set(existingDocs.map(d => normalizeTitle(d.title)));
  const existingNormalizedTitles = Array.from(existingTitleSet);
  console.log('Loaded', existingNormalizedTitles.length, 'existing titles for duplicate checks.');

  // we'll also keep a short history of recent titles passed to model as forbidden list (capped)
  const recentTitles = existingDocs.slice(-100).map(d => d.title).filter(Boolean);

  let generated = 0;
  let round = 0;

  while (generated < TOTAL_TO_GENERATE) {
    round++;
    const remaining = TOTAL_TO_GENERATE - generated;
    const askTopics = Math.min(TOPICS_PER_ROUND, Math.max(6, remaining * 2)); // ask for ~2x remaining to increase survival
    const seedSlice = seeds.slice(0, Math.min(6, seeds.length)); // small style examples
    console.log(`Round ${round}: requesting ${askTopics} topics (need ${remaining} questions)`);

    let topics = [];
    try {
      topics = await generateTopics(seedSlice, askTopics);
      console.log(`Got ${topics.length} topic candidates.`);
    } catch (e) {
      console.error('Topics generation failed:', e && e.message ? e.message : e);
      // fallback: generate trivial topics from seeds
      topics = seedSlice.map((s,i)=> `${s} (variant ${round}-${i})`);
    }

    // iterate topics and request one question per topic
    for (const topic of topics) {
      if (generated >= TOTAL_TO_GENERATE) break;

      // quick filter: skip if topic title is too similar to existing titles
      if (isFuzzyDuplicate(topic, existingNormalizedTitles, 0.18)) {
        console.log('Skipping topic (too similar to existing):', topic);
        continue;
      }

      // build forbid list (recent + top existing)
      const forbidList = Array.from(existingTitleSet).slice(-200).concat(recentTitles).slice(-200);

      const qPrompt = buildPromptForTopic(topic, forbidList, 1);
      let qRaw = '';
      let qParsed = null;
      try {
        const res = await retry(() => callLLM_Gemini(qPrompt), { retries: MAX_RETRIES, minDelayMs: 700 });
        qRaw = responseDataToText(res);
        fs.writeFileSync(path.join(LOG_DIR, `question_raw_${Date.now()}.txt`), qRaw, 'utf8');
      } catch (e) {
        console.warn('LLM question call failed for topic:', topic, e && e.message ? e.message : e);
        // small backoff and continue
        await sleep(800 + Math.random() * 800);
        continue;
      }

      // parse output: extract first balanced array
      let arrStr = extractFirstBalancedArray(qRaw) || healJsonString(qRaw);
      if (!arrStr) {
        console.warn('No JSON array in response for topic:', topic);
        continue;
      }
      try {
        const parsed = JSON.parse(arrStr);
        if (Array.isArray(parsed) && parsed.length > 0) qParsed = parsed[0];
        else { console.warn('Parsed JSON not an array or empty for topic:', topic); continue; }
      } catch (e) {
        // try small fixes
        try {
          const alt = arrStr.replace(/'/g, '"').replace(/,\s*([}\]])/g, '$1');
          const parsed = JSON.parse(alt);
          if (Array.isArray(parsed) && parsed.length > 0) qParsed = parsed[0];
          else { console.warn('Alt parse failed for topic:', topic); continue; }
        } catch (e2) {
          console.warn('Failed to parse JSON for topic:', topic);
          fs.writeFileSync(path.join(LOG_DIR, `bad_question_${Date.now()}.txt`), qRaw, 'utf8');
          continue;
        }
      }

      // now validate fields exist and normalize
      const candidate = {
        title: (qParsed.title || '').toString().trim(),
        description: qParsed.description || '',
        difficulty: qParsed.difficulty || 'Medium',
        tags: Array.isArray(qParsed.tags) ? qParsed.tags.map(t=>String(t)) : [],
        sampleInput: qParsed.sampleInput || '',
        sampleOutput: qParsed.sampleOutput || '',
        testCases: Array.isArray(qParsed.testCases) ? qParsed.testCases.map(tc => ({
          input: tc.input || '',
          output: tc.output || '',
          score: typeof tc.score === 'number' ? tc.score : (tc.score ? Number(tc.score) : 1),
          explanation: tc.explanation || '',
          visible: typeof tc.visible === 'boolean' ? tc.visible : (tc.visible ? true : false)
        })) : [],
        timeLimit: typeof qParsed.timeLimit === 'number' ? qParsed.timeLimit : Number(qParsed.timeLimit || 5),
        memoryLimit: typeof qParsed.memoryLimit === 'number' ? qParsed.memoryLimit : Number(qParsed.memoryLimit || 256),
        maxCodeSize: typeof qParsed.maxCodeSize === 'number' ? qParsed.maxCodeSize : Number(qParsed.maxCodeSize || 1024),
        timeAllowed: typeof qParsed.timeAllowed === 'number' ? qParsed.timeAllowed : Number(qParsed.timeAllowed || 15),
        maxAttempts: typeof qParsed.maxAttempts === 'number' ? qParsed.maxAttempts : Number(qParsed.maxAttempts || 3)
      };

      // schema validation
      if (!validateQuestion(candidate)) {
        console.warn('Candidate failed schema validation:', candidate.title || '(no title)', validateQuestion.errors);
        // log for inspection
        fs.appendFileSync(path.join(LOG_DIR, 'invalid_candidates.json'), JSON.stringify({ topic, candidate, errors: validateQuestion.errors }, null, 2) + '\n', 'utf8');
        continue;
      }

      const norm = normalizeTitle(candidate.title);
      // duplicates: exact in-memory
      if (existingTitleSet.has(norm)) {
        console.log('Skipping candidate (exact duplicate):', candidate.title);
        continue;
      }
      // fuzzy duplicate
      if (isFuzzyDuplicate(candidate.title, existingNormalizedTitles, 0.18)) {
        console.log('Skipping candidate (fuzzy duplicate):', candidate.title);
        fs.appendFileSync(path.join(LOG_DIR,'fuzzy_blocked.txt'), candidate.title + '\n', 'utf8');
        continue;
      }

      // finally insert or preview
      if (PREVIEW) {
        console.log('(Preview) Accepting question:', candidate.title, `[${candidate.difficulty}]`);
        // update in-memory caches to avoid duplicates in same session
        existingTitleSet.add(norm);
        existingNormalizedTitles.push(norm);
        recentTitles.push(candidate.title);
        generated++;
      } else {
        try {
          const exists = await Question.findOne({ title: candidate.title }).collation({ locale: 'en', strength: 2 }).lean();
          if (exists) { console.log('Skipped (db duplicate):', candidate.title); continue; }
          await Question.create(candidate);
          console.log(`Saved (${generated+1}/${TOTAL_TO_GENERATE}):`, candidate.title);
          existingTitleSet.add(norm);
          existingNormalizedTitles.push(norm);
          recentTitles.push(candidate.title);
          generated++;
        } catch (e) {
          const em = e && e.message ? e.message : '';
          if (em.includes('E11000') || em.toLowerCase().includes('duplicate')) {
            console.log('DB duplicate prevented insertion for', candidate.title);
            continue;
          }
          console.error('DB insert error for', candidate.title, e && e.message ? e.message : e);
          fs.appendFileSync(path.join(LOG_DIR,'db_errors.txt'), JSON.stringify({ err: String(e), candidate }, null, 2) + '\n', 'utf8');
        }
      }

      // small cooldown
      await sleep(300 + Math.random()*500);
    } // end topic loop

    console.log(`Round ${round} complete. Generated so far: ${generated}/${TOTAL_TO_GENERATE}`);
    // short wait before next round
    await sleep(1000 + Math.random() * 1500);
  } // end while

  console.log('Generation finished. Total generated (accepted):', generated);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Fatal error:', err && err.stack ? err.stack : err);
  process.exit(1);
});