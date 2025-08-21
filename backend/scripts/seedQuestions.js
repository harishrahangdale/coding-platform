/**
 * Hard reset + seed for Questions & Scaffolds (Judge0 language IDs).
 * It DROPS existing collections (questions, scaffolds), recreates indexes, and seeds new data.
 *
 * Usage:
 *   MONGO_URI="mongodb+srv://..." node scripts/seedQuestions.js
 */

const mongoose = require("mongoose");
require("dotenv").config();

// Import your models (ensure these paths are correct)
const Question = require("../models/Question");  // dynamic testCases schema
const Scaffold = require("../models/Scaffold");  // languageId + languageName, unique (questionId, languageId)

// ---------------- SEED DATA (edit/add freely) ----------------
const seed = [
  {
    question: {
      title: "Sum of Two Numbers",
      description: "Read two integers and print their sum.",
      difficulty: "Easy",
      tags: ["math", "intro"],
      sampleInput: "2 3",
      sampleOutput: "5",
      timeLimit: 2,
      memoryLimit: 128,
      maxCodeSize: 64,
      maxAttempts: 3,
      testCases: [
        { input: "2 3", output: "5", score: 2 },
        { input: "-5 10", output: "5", score: 2 },
        { input: "100 200", output: "300", score: 2 },
        { input: "-1000000000 1000000000", output: "0", score: 2 },
        { input: "7 8", output: "15", score: 2 },
      ],
    },
    scaffolds: [
      {
        languageId: 62, // Java 17 (example Judge0 ID)
        languageName: "Java 17",
        body:
`import java.util.*;
public class Main{
  public static void main(String[] args){
    Scanner sc = new Scanner(System.in);
    long a = sc.nextLong(), b = sc.nextLong();
    // TODO
    System.out.println(a + b);
  }
}`
      },
      {
        languageId: 71, // Python 3.8.x (example)
        languageName: "Python 3.8",
        body:
`a, b = map(int, input().split())
# TODO
print(a + b)`
      }
    ]
  },

  {
    question: {
      title: "Reverse String",
      description: "Print the reverse of a string.",
      difficulty: "Easy",
      tags: ["strings"],
      sampleInput: "hello",
      sampleOutput: "olleh",
      timeLimit: 2,
      memoryLimit: 128,
      maxCodeSize: 64,
      maxAttempts: 3,
      testCases: [
        { input: "hello", output: "olleh", score: 2 },
        { input: "world", output: "dlrow", score: 2 },
        { input: "abc", output: "cba", score: 2 },
      ],
    },
    scaffolds: [
      {
        languageId: 62,
        languageName: "Java 17",
        body:
`import java.io.*;
public class Main{
  public static void main(String[] args) throws Exception{
    BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
    String s = br.readLine();
    // TODO
    System.out.println(new StringBuilder(s).reverse().toString());
  }
}`
      },
      {
        languageId: 63, // Node.js (example)
        languageName: "JavaScript (Node)",
        body:
`const fs = require('fs');
const s = fs.readFileSync(0,'utf8').trim();
// TODO
console.log(s.split('').reverse().join(''));`
      }
    ]
  },

  {
    question: {
      title: "Fibonacci Number",
      description: "Return the nth Fibonacci number.",
      difficulty: "Medium",
      tags: ["dp"],
      sampleInput: "10",
      sampleOutput: "55",
      timeLimit: 2,
      memoryLimit: 128,
      maxCodeSize: 128,
      maxAttempts: 3,
      testCases: [
        { input: "0", output: "0", score: 2 },
        { input: "1", output: "1", score: 2 },
        { input: "10", output: "55", score: 3 },
        { input: "15", output: "610", score: 3 },
      ],
    },
    scaffolds: [
      {
        languageId: 62,
        languageName: "Java 17",
        body:
`import java.util.*;
public class Main{
  public static void main(String[] args){
    Scanner sc = new Scanner(System.in);
    int n = sc.nextInt();
    // TODO
    if(n<=1){ System.out.println(n); return; }
    long a=0,b=1;
    for(int i=2;i<=n;i++){ long c=a+b; a=b; b=c; }
    System.out.println(b);
  }
}`
      },
      {
        languageId: 71,
        languageName: "Python 3.8",
        body:
`n = int(input())
# TODO
if n <= 1:
    print(n)
else:
    a, b = 0, 1
    for _ in range(2, n+1):
        a, b = b, a+b
    print(b)`
      }
    ]
  }
];
// ------------------------------------------------------------

async function safeDrop(collectionName) {
  const db = mongoose.connection.db;
  const cols = await db.listCollections({ name: collectionName }).toArray();
  if (cols.length > 0) {
    console.log(`Dropping existing collection: ${collectionName}`);
    await db.dropCollection(collectionName);
  } else {
    console.log(`Collection not found (skip drop): ${collectionName}`);
  }
}

async function main() {
  try {
    if (!process.env.MONGO_URI) {
      console.error("Missing MONGO_URI in environment.");
      process.exit(1);
    }

    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("MongoDB connected");

    // 1) DROP existing collections (this resets schema & data)
    await safeDrop("questions");
    await safeDrop("scaffolds");

    // 2) Ensure indexes from schemas are (re)created
    //    syncIndexes() aligns indexes in MongoDB with your schema definitions
    console.log("Syncing indexes...");
    await Question.syncIndexes();
    await Scaffold.syncIndexes();

    // 3) Seed inside a transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      console.log("Seeding questions & scaffolds...");

      for (const item of seed) {
        const [q] = await Question.create([item.question], { session });
        const questionId = q._id;

        if (item.scaffolds?.length) {
          const docs = item.scaffolds.map(s => ({
            questionId,
            languageId: Number(s.languageId),
            languageName: String(s.languageName),
            body: String(s.body ?? ""),
          }));
          await Scaffold.insertMany(docs, { session });
        }
      }

      await session.commitTransaction();
      session.endSession();
      console.log("✅ Seed completed successfully.");
    } catch (e) {
      await session.abortTransaction();
      session.endSession();
      throw e;
    }
  } catch (err) {
    console.error("❌ Seed failed:", err);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

main();