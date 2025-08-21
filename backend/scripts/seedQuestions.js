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
const { time } = require("console");

// Seed data
// ---------------- SEED DATA (minimal scaffolds with TODO placeholders) ----------------
const seed = [
  {
    question: {
      title: "Sum of Two Numbers",
      description: "Read two integers a and b and print a + b.",
      difficulty: "Easy",
      tags: ["math", "intro"],
      sampleInput: "2 3",
      sampleOutput: "5",
      timeLimit: 2,
      memoryLimit: 128,
      maxCodeSize: 64,
      timeAllowed: 5,
      maxAttempts: 3,
      testCases: [
        { input: "2 3", output: "5", score: 2, visible: true },
        { input: "-5 10", output: "5", score: 2, visible: false },
        { input: "100 200", output: "300", score: 2, visible: false },
        { input: "-1000000000 1000000000", output: "0", score: 2, visible: false },
        { input: "7 8", output: "15", score: 2, visible: true },
      ],
    },
    scaffolds: [
      {
        languageId: 62, languageName: "Java 17",
        body:
`import java.util.*;
public class Main {
  static long solve(long a, long b) {
    // TODO: Implement logic to return a + b
    return 0;
  }
  public static void main(String[] args) {
    Scanner sc = new Scanner(System.in);
    long a = sc.nextLong();
    long b = sc.nextLong();
    System.out.println(solve(a, b));
  }
}`
      },
      {
        languageId: 71, languageName: "Python 3.8",
        body:
`def solve(a, b):
    # TODO: Implement logic to return a + b
    return 0

a, b = map(int, input().split())
print(solve(a, b))`
      }
    ]
  },

  {
    question: {
      title: "Reverse String",
      description: "Given a string s, print its reverse.",
      difficulty: "Easy",
      tags: ["strings"],
      sampleInput: "hello",
      sampleOutput: "olleh",
      timeLimit: 2,
      memoryLimit: 128,
      maxCodeSize: 64,
      timeAllowed: 5,
      maxAttempts: 3,
      testCases: [
        { input: "hello", output: "olleh", score: 2, visible: true },
        { input: "world", output: "dlrow", score: 2, visible: false },
        { input: "a", output: "a", score: 1, visible: false },
        { input: "", output: "", score: 1, visible: true },
      ],
    },
    scaffolds: [
      {
        languageId: 62, languageName: "Java 17",
        body:
`import java.io.*;
public class Main {
  static String solve(String s) {
    // TODO: Return the reverse of s
    return "";
  }
  public static void main(String[] args) throws Exception {
    BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
    String s = br.readLine();
    if (s == null) s = "";
    System.out.println(solve(s));
  }
}`
      },
      {
        languageId: 63, languageName: "JavaScript (Node)",
        body:
`function solve(s){
  // TODO: Return reverse of s
  return "";
}
const fs = require('fs');
const s = fs.readFileSync(0,'utf8').replace(/\\r?\\n$/, "");
console.log(solve(s));`
      }
    ]
  },

  {
    question: {
      title: "Fibonacci Number",
      description: "Return the nth Fibonacci number (0-indexed). 0 ≤ n ≤ 50.",
      difficulty: "Medium",
      tags: ["dp", "math"],
      sampleInput: "10",
      sampleOutput: "55",
      timeLimit: 2,
      memoryLimit: 128,
      maxCodeSize: 128,
      timeAllowed: 8,
      maxAttempts: 3,
      testCases: [
        { input: "0", output: "0", score: 2, visible: true },
        { input: "1", output: "1", score: 2, visible: false },
        { input: "5", output: "5", score: 2, visible: false },
        { input: "10", output: "55", score: 2, visible: false },
        { input: "20", output: "6765", score: 2, visible: true },
      ],
    },
    scaffolds: [
      {
        languageId: 62, languageName: "Java 17",
        body:
`import java.util.*;
public class Main {
  static long solve(int n) {
    // TODO: Return nth Fibonacci number
    return 0L;
  }
  public static void main(String[] args) {
    int n = new Scanner(System.in).nextInt();
    System.out.println(solve(n));
  }
}`
      },
      {
        languageId: 71, languageName: "Python 3.8",
        body:
`def solve(n: int) -> int:
    # TODO: Return nth Fibonacci number
    return 0

n = int(input())
print(solve(n))`
      }
    ]
  },

  {
    question: {
      title: "Palindrome Check",
      description: "Given string s, print true if s is a palindrome ignoring case; else false.",
      difficulty: "Easy",
      tags: ["strings", "two-pointers"],
      sampleInput: "Level",
      sampleOutput: "true",
      timeLimit: 2,
      memoryLimit: 128,
      maxCodeSize: 64,
      timeAllowed: 5,
      maxAttempts: 3,
      testCases: [
        { input: "madam", output: "true", score: 2, visible: true },
        { input: "Level", output: "true", score: 2, visible: false },
        { input: "hello", output: "false", score: 2, visible: true },
        { input: "", output: "true", score: 1, visible: false },
      ],
    },
    scaffolds: [
      {
        languageId: 62, languageName: "Java 17",
        body:
`import java.io.*;
public class Main {
  static String solve(String s) {
    // TODO: Return "true"/"false" if s is palindrome (case-insensitive)
    return "false";
  }
  public static void main(String[] args) throws Exception {
    BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
    String s = br.readLine();
    if (s == null) s = "";
    System.out.println(solve(s));
  }
}`
      },
      {
        languageId: 71, languageName: "Python 3.8",
        body:
`def solve(s: str) -> str:
    # TODO: Return "true" if palindrome else "false"
    return "false"

s = input() if True else ""
print(solve(s))`
      }
    ]
  },

  {
    question: {
      title: "Count Words",
      description: "Given a line, count words separated by whitespace.",
      difficulty: "Easy",
      tags: ["strings", "parsing"],
      sampleInput: "Hello   world",
      sampleOutput: "2",
      timeLimit: 1,
      memoryLimit: 64,
      maxCodeSize: 64,
      timeAllowed: 5,
      maxAttempts: 3,
      testCases: [
        { input: "Hello world", output: "2", score: 2, visible: true },
        { input: "One  two   three", output: "3", score: 2, visible: false },
        { input: "", output: "0", score: 1, visible: false },
      ],
    },
    scaffolds: [
      {
        languageId: 62, languageName: "Java 17",
        body:
`import java.io.*;
public class Main {
  static int solve(String s) {
    // TODO: Return number of words (split by whitespace)
    return 0;
  }
  public static void main(String[] args) throws Exception {
    String s = new BufferedReader(new InputStreamReader(System.in)).readLine();
    if (s == null) s = "";
    System.out.println(solve(s));
  }
}`
      },
      {
        languageId: 71, languageName: "Python 3.8",
        body:
`def solve(s: str) -> int:
    # TODO: Return number of words separated by whitespace
    return 0

s = input()
print(solve(s))`
      }
    ]
  },

  {
    question: {
      title: "Two Sum (Indices)",
      description: "Given n, array of n integers, and target on next line, output two indices i j (0-based) such that a[i]+a[j]=target. Assume one solution exists.",
      difficulty: "Medium",
      tags: ["arrays", "hashmap"],
      sampleInput: "4\n2 7 11 15\n9",
      sampleOutput: "0 1",
      timeLimit: 2,
      memoryLimit: 128,
      maxCodeSize: 128,
      timeAllowed: 10,
      maxAttempts: 3,
      testCases: [
        { input: "4\n2 7 11 15\n9", output: "0 1", score: 3, visible: true },
        { input: "3\n3 2 4\n6", output: "1 2", score: 3, visible: false },
        { input: "2\n3 3\n6", output: "0 1", score: 4, visible: false },
      ],
    },
    scaffolds: [
      {
        languageId: 62, languageName: "Java 17",
        body:
`import java.util.*;
public class Main {
  static String solve(int[] a, int target) {
    // TODO: Return "i j" (indices separated by space)
    return "";
  }
  public static void main(String[] args) {
    Scanner sc = new Scanner(System.in);
    int n = sc.nextInt(); int[] a = new int[n];
    for(int i=0;i<n;i++) a[i]=sc.nextInt();
    int target = sc.nextInt();
    System.out.println(solve(a, target));
  }
}`
      },
      {
        languageId: 71, languageName: "Python 3.8",
        body:
`def solve(arr, target):
    # TODO: Return "i j" (0-based indices)
    return ""

import sys
data=list(map(int,sys.stdin.read().strip().split()))
n=data[0]; arr=data[1:1+n]; target=data[1+n]
print(solve(arr, target))`
      }
    ]
  },

  {
    question: {
      title: "Valid Parentheses",
      description: "Given a string with only ()[]{}, determine if it is valid.",
      difficulty: "Medium",
      tags: ["stack"],
      sampleInput: "()[]{}",
      sampleOutput: "true",
      timeLimit: 2,
      memoryLimit: 128,
      maxCodeSize: 128,
      timeAllowed: 10,
      maxAttempts: 3,
      testCases: [
        { input: "()", output: "true", score: 2, visible: true },
        { input: "()[]{}", output: "true", score: 2, visible: false },
        { input: "(]", output: "false", score: 3, visible: false },
        { input: "([)]", output: "false", score: 3, visible: true },
        { input: "{[]}", output: "true", score: 4, visible: false },
      ],
    },
    scaffolds: [
      {
        languageId: 62, languageName: "Java 17",
        body:
`import java.util.*;
public class Main {
  static String solve(String s) {
    // TODO: Return "true" if valid else "false"
    return "false";
  }
  public static void main(String[] args) {
    String s = new Scanner(System.in).nextLine();
    System.out.println(solve(s));
  }
}`
      },
      {
        languageId: 71, languageName: "Python 3.8",
        body:
`def solve(s: str) -> str:
    # TODO: Return "true" or "false"
    return "false"

s=input().strip()
print(solve(s))`
      }
    ]
  },

  {
    question: {
      title: "Maximum Subarray Sum",
      description: "Given array length n and array, print the maximum subarray sum.",
      difficulty: "Medium",
      tags: ["arrays", "dp"],
      sampleInput: "9\n-2 1 -3 4 -1 2 1 -5 4",
      sampleOutput: "6",
      timeLimit: 2,
      memoryLimit: 128,
      maxCodeSize: 128,
      timeAllowed: 10,
      maxAttempts: 3,
      testCases: [
        { input: "9\n-2 1 -3 4 -1 2 1 -5 4", output: "6", score: 3, visible: true },
        { input: "1\n1", output: "1", score: 2, visible: false },
        { input: "3\n-1 -2 -3", output: "-1", score: 3, visible: true },
        { input: "5\n5 -1 5 -1 5", output: "13", score: 2, visible: false },
      ],
    },
    scaffolds: [
      {
        languageId: 62, languageName: "Java 17",
        body:
`import java.util.*;
public class Main {
  static long solve(int[] a) {
    // TODO: Return maximum subarray sum
    return 0L;
  }
  public static void main(String[] args) {
    Scanner sc = new Scanner(System.in);
    int n=sc.nextInt(); int[] a=new int[n];
    for(int i=0;i<n;i++) a[i]=sc.nextInt();
    System.out.println(solve(a));
  }
}`
      },
      {
        languageId: 71, languageName: "Python 3.8",
        body:
`def solve(arr):
    # TODO: Return maximum subarray sum
    return 0

import sys
d=list(map(int,sys.stdin.read().strip().split()))
n=d[0]; a=d[1:1+n]
print(solve(a))`
      }
    ]
  },

  {
    question: {
      title: "GCD of Two Numbers",
      description: "Compute the greatest common divisor of a and b.",
      difficulty: "Easy",
      tags: ["math", "euclid"],
      sampleInput: "54 24",
      sampleOutput: "6",
      timeLimit: 1,
      memoryLimit: 64,
      maxCodeSize: 64,
      timeAllowed: 5,
      maxAttempts: 3,
      testCases: [
        { input: "54 24", output: "6", score: 2, visible: true },
        { input: "0 5", output: "5", score: 2, visible: false },
        { input: "5 0", output: "5", score: 2, visible: false },
        { input: "17 13", output: "1", score: 2, visible: true },
      ],
    },
    scaffolds: [
      {
        languageId: 62, languageName: "Java 17",
        body:
`import java.util.*;
public class Main {
  static long solve(long a, long b) {
    // TODO: Return gcd(a, b)
    return 0L;
  }
  public static void main(String[] args) {
    Scanner sc=new Scanner(System.in);
    long a=sc.nextLong(), b=sc.nextLong();
    System.out.println(solve(a,b));
  }
}`
      },
      {
        languageId: 71, languageName: "Python 3.8",
        body:
`def solve(a, b):
    # TODO: Return gcd(a,b)
    return 0

a,b = map(int, input().split())
print(solve(a,b))`
      }
    ]
  },

  {
    question: {
      title: "LCM of Two Numbers",
      description: "Compute least common multiple of a and b. Use 64-bit arithmetic.",
      difficulty: "Easy",
      tags: ["math"],
      sampleInput: "4 6",
      sampleOutput: "12",
      timeLimit: 1,
      memoryLimit: 64,
      maxCodeSize: 64,
      timeAllowed: 5,
      maxAttempts: 3,
      testCases: [
        { input: "4 6", output: "12", score: 2, visible: true },
        { input: "21 6", output: "42", score: 2, visible: false },
        { input: "0 5", output: "0", score: 2, visible: true },
      ],
    },
    scaffolds: [
      {
        languageId: 62, languageName: "Java 17",
        body:
`import java.util.*;
public class Main {
  static long solve(long a, long b) {
    // TODO: Return lcm(a, b)
    return 0L;
  }
  public static void main(String[] args) {
    Scanner sc=new Scanner(System.in);
    long a=sc.nextLong(), b=sc.nextLong();
    System.out.println(solve(a,b));
  }
}`
      },
      {
        languageId: 71, languageName: "Python 3.8",
        body:
`def solve(a, b):
    # TODO: Return lcm(a,b)
    return 0

a,b = map(int, input().split())
print(solve(a,b))`
      }
    ]
  },

  {
    question: {
      title: "Check Prime",
      description: "Given n (0 ≤ n ≤ 10^7), print true if prime else false.",
      difficulty: "Easy",
      tags: ["math", "primes"],
      sampleInput: "7",
      sampleOutput: "true",
      timeLimit: 1,
      memoryLimit: 64,
      maxCodeSize: 64,
      timeAllowed: 5,
      maxAttempts: 3,
      testCases: [
        { input: "7", output: "true", score: 2, visible: true },
        { input: "1", output: "false", score: 2, visible: false },
        { input: "0", output: "false", score: 1, visible: true },
        { input: "1000003", output: "true", score: 3, visible: false },
      ],
    },
    scaffolds: [
      {
        languageId: 62, languageName: "Java 17",
        body:
`import java.util.*;
public class Main {
  static String solve(int n) {
    // TODO: Return "true" if prime else "false"
    return "false";
  }
  public static void main(String[] args) {
    int n=new Scanner(System.in).nextInt();
    System.out.println(solve(n));
  }
}`
      },
      {
        languageId: 71, languageName: "Python 3.8",
        body:
`def solve(n: int) -> str:
    # TODO: Return "true" if prime else "false"
    return "false"

n=int(input())
print(solve(n))`
      }
    ]
  },

  {
    question: {
      title: "Anagram Check",
      description: "Given two strings on separate lines, check if they are anagrams (case-insensitive).",
      difficulty: "Easy",
      tags: ["strings", "hashing"],
      sampleInput: "Listen\nSilent",
      sampleOutput: "true",
      timeLimit: 1,
      memoryLimit: 64,
      maxCodeSize: 64,
      timeAllowed: 5,
      maxAttempts: 3,
      testCases: [
        { input: "listen\nsilent", output: "true", score: 2, visible: true },
        { input: "hello\nbello", output: "false", score: 2, visible: false },
        { input: "Debit Card\nBad Credit", output: "true", score: 2, visible: true },
      ],
    },
    scaffolds: [
      {
        languageId: 62, languageName: "Java 17",
        body:
`import java.io.*;
public class Main {
  static String solve(String a, String b) {
    // TODO: Return "true" if anagrams else "false"
    return "false";
  }
  public static void main(String[] args) throws Exception {
    BufferedReader br=new BufferedReader(new InputStreamReader(System.in));
    String a=br.readLine(), b=br.readLine();
    System.out.println(solve(a, b));
  }
}`
      },
      {
        languageId: 71, languageName: "Python 3.8",
        body:
`def solve(a: str, b: str) -> str:
    # TODO: Return "true" if anagrams else "false"
    return "false"

a=input(); b=input()
print(solve(a,b))`
      }
    ]
  },

  {
    question: {
      title: "Rotate Array Right",
      description: "Rotate array to the right by k steps. Input: n, array, k.",
      difficulty: "Medium",
      tags: ["arrays"],
      sampleInput: "7\n1 2 3 4 5 6 7\n3",
      sampleOutput: "5 6 7 1 2 3 4",
      timeLimit: 2,
      memoryLimit: 128,
      maxCodeSize: 128,
      timeAllowed: 10,
      maxAttempts: 3,
      testCases: [
        { input: "7\n1 2 3 4 5 6 7\n3", output: "5 6 7 1 2 3 4", score: 3, visible: true },
        { input: "1\n10\n10", output: "10", score: 1, visible: false },
        { input: "5\n1 2 3 4 5\n0", output: "1 2 3 4 5", score: 2, visible: false },
      ],
    },
    scaffolds: [
      {
        languageId: 62, languageName: "Java 17",
        body:
`import java.util.*;
public class Main {
  static int[] solve(int[] a, int k) {
    // TODO: Rotate right by k and return array
    return a;
  }
  public static void main(String[] args) {
    Scanner sc=new Scanner(System.in);
    int n=sc.nextInt(); int[] a=new int[n];
    for(int i=0;i<n;i++) a[i]=sc.nextInt();
    int k=sc.nextInt();
    int[] res = solve(a, k);
    for(int i=0;i<res.length;i++){
      if(i>0) System.out.print(" ");
      System.out.print(res[i]);
    }
  }
}`
      },
      {
        languageId: 71, languageName: "Python 3.8",
        body:
`def solve(arr, k):
    # TODO: Rotate right by k and return list
    return arr

import sys
d=list(map(int,sys.stdin.read().strip().split()))
n=d[0]; arr=d[1:1+n]; k=d[1+n] if n>0 else 0
print(*solve(arr,k))`
      }
    ]
  },

  {
    question: {
      title: "Matrix Transpose",
      description: "Given r c and r*c matrix, output its transpose c*r.",
      difficulty: "Easy",
      tags: ["matrix"],
      sampleInput: "2 3\n1 2 3\n4 5 6",
      sampleOutput: "1 4\n2 5\n3 6",
      timeLimit: 2,
      memoryLimit: 128,
      maxCodeSize: 64,
      timeAllowed: 5,
      maxAttempts: 3,
      testCases: [
        { input: "2 3\n1 2 3\n4 5 6", output: "1 4\n2 5\n3 6", score: 2, visible: true },
        { input: "1 1\n42", output: "42", score: 1, visible: false },
        { input: "3 2\n1 2\n3 4\n5 6", output: "1 3 5\n2 4 6", score: 2, visible: true },
      ],
    },
    scaffolds: [
      {
        languageId: 62, languageName: "Java 17",
        body:
`import java.util.*;
public class Main {
  static int[][] solve(int[][] a, int r, int c) {
    // TODO: Return transpose matrix
    return a;
  }
  public static void main(String[] args){
    Scanner sc=new Scanner(System.in);
    int r=sc.nextInt(), c=sc.nextInt();
    int[][] a=new int[r][c];
    for(int i=0;i<r;i++) for(int j=0;j<c;j++) a[i][j]=sc.nextInt();
    int[][] t=solve(a,r,c);
    for(int i=0;i<c;i++){
      for(int j=0;j<r;j++){
        if(j>0) System.out.print(" ");
        System.out.print(t[i][j]);
      }
      System.out.println();
    }
  }
}`
      },
      {
        languageId: 71, languageName: "Python 3.8",
        body:
`def solve(mat, r, c):
    # TODO: Return transposed matrix (list of lists) of size c x r
    return mat

import sys
data=list(map(int,sys.stdin.read().strip().split()))
r,c=data[0],data[1]; vals=data[2:]
a=[vals[i*c:(i+1)*c] for i in range(r)]
t=solve(a,r,c)
for row in t:
    print(*row)`
      }
    ]
  },

  {
    question: {
      title: "Binary Search (Index)",
      description: "Given n, sorted array, and target, return index or -1 if not found.",
      difficulty: "Easy",
      tags: ["search", "binary-search"],
      sampleInput: "5\n1 3 4 8 10\n4",
      sampleOutput: "2",
      timeLimit: 1,
      memoryLimit: 64,
      maxCodeSize: 64,
      timeAllowed: 5,
      maxAttempts: 3,
      testCases: [
        { input: "5\n1 3 4 8 10\n4", output: "2", score: 2, visible: true },
        { input: "5\n1 3 4 8 10\n7", output: "-1", score: 2, visible: false },
        { input: "1\n5\n5", output: "0", score: 1, visible: true },
      ],
    },
    scaffolds: [
      {
        languageId: 62, languageName: "Java 17",
        body:
`import java.util.*;
public class Main{
  static int solve(int[] a, int x){
    // TODO: Return index or -1
    return -1;
  }
  public static void main(String[] args){
    Scanner sc=new Scanner(System.in);
    int n=sc.nextInt(); int[] a=new int[n];
    for(int i=0;i<n;i++) a[i]=sc.nextInt();
    int x=sc.nextInt();
    System.out.println(solve(a,x));
  }
}`
      },
      {
        languageId: 71, languageName: "Python 3.8",
        body:
`def solve(a, x):
    # TODO: Return index or -1
    return -1

import sys
d=list(map(int,sys.stdin.read().strip().split()))
n=d[0]; a=d[1:1+n]; x=d[1+n]
print(solve(a,x))`
      }
    ]
  },

  {
    question: {
      title: "Longest Common Prefix",
      description: "Given n and then n strings, print their longest common prefix.",
      difficulty: "Medium",
      tags: ["strings"],
      sampleInput: "3\nflower\nflow\nflight",
      sampleOutput: "fl",
      timeLimit: 2,
      memoryLimit: 128,
      maxCodeSize: 128,
      timeAllowed: 10,
      maxAttempts: 3,
      testCases: [
        { input: "3\nflower\nflow\nflight", output: "fl", score: 3, visible: true },
        { input: "2\na\nb", output: "", score: 2, visible: false },
        { input: "1\nalone", output: "alone", score: 2, visible: true },
      ],
    },
    scaffolds: [
      {
        languageId: 62, languageName: "Java 17",
        body:
`import java.io.*;
public class Main {
  static String solve(String[] arr) {
    // TODO: Return longest common prefix
    return "";
  }
  public static void main(String[] args) throws Exception {
    BufferedReader br=new BufferedReader(new InputStreamReader(System.in));
    int n=Integer.parseInt(br.readLine().trim());
    String[] s=new String[n];
    for(int i=0;i<n;i++) s[i]=br.readLine();
    System.out.println(solve(s));
  }
}`
      },
      {
        languageId: 71, languageName: "Python 3.8",
        body:
`def solve(arr):
    # TODO: Return longest common prefix
    return ""

n=int(input().strip())
arr=[input().rstrip("\\n") for _ in range(n)]
print(solve(arr))`
      }
    ]
  },

  {
    question: {
      title: "Roman to Integer",
      description: "Convert Roman numeral (I,V,X,L,C,D,M) to integer.",
      difficulty: "Medium",
      tags: ["parsing", "strings"],
      sampleInput: "MCMXCIV",
      sampleOutput: "1994",
      timeLimit: 2,
      memoryLimit: 128,
      maxCodeSize: 128,
      timeAllowed: 10,
      maxAttempts: 3,
      testCases: [
        { input: "III", output: "3", score: 2, visible: true },
        { input: "IV", output: "4", score: 2, visible: false },
        { input: "IX", output: "9", score: 2, visible: false },
        { input: "LVIII", output: "58", score: 2, visible: false },
        { input: "MCMXCIV", output: "1994", score: 3, visible: true },
      ],
    },
    scaffolds: [
      {
        languageId: 62, languageName: "Java 17",
        body:
`import java.util.*;
public class Main{
  static int solve(String s){
    // TODO: Convert Roman to int
    return 0;
  }
  public static void main(String[] args){
    String s=new Scanner(System.in).nextLine().trim();
    System.out.println(solve(s));
  }
}`
      },
      {
        languageId: 71, languageName: "Python 3.8",
        body:
`def solve(s: str) -> int:
    # TODO: Convert Roman to integer
    return 0

s=input().strip()
print(solve(s))`
      }
    ]
  },

  {
    question: {
      title: "Unique Characters",
      description: "Given a string, print true if all characters are unique; else false.",
      difficulty: "Easy",
      tags: ["strings", "hashset"],
      sampleInput: "abc",
      sampleOutput: "true",
      timeLimit: 1,
      memoryLimit: 64,
      maxCodeSize: 64,
      timeAllowed: 5,
      maxAttempts: 3,
      testCases: [
        { input: "abc", output: "true", score: 2, visible: true },
        { input: "abca", output: "false", score: 2, visible: false },
        { input: "", output: "true", score: 1, visible: true },
      ],
    },
    scaffolds: [
      {
        languageId: 62, languageName: "Java 17",
        body:
`import java.io.*;
public class Main {
  static String solve(String s) {
    // TODO: Return "true" if all unique else "false"
    return "false";
  }
  public static void main(String[] args) throws Exception {
    String s=new BufferedReader(new InputStreamReader(System.in)).readLine();
    if(s==null) s="";
    System.out.println(solve(s));
  }
}`
      },
      {
        languageId: 71, languageName: "Python 3.8",
        body:
`def solve(s: str) -> str:
    # TODO: Return "true" if unique else "false"
    return "false"

s=input()
print(solve(s))`
      }
    ]
  },

  {
    question: {
      title: "Remove Duplicates from Sorted Array",
      description: "Given n and a sorted array, remove duplicates and print new length.",
      difficulty: "Medium",
      tags: ["two-pointers", "arrays"],
      sampleInput: "5\n1 1 2 2 3",
      sampleOutput: "3",
      timeLimit: 2,
      memoryLimit: 128,
      maxCodeSize: 128,
      timeAllowed: 10,
      maxAttempts: 3,
      testCases: [
        { input: "5\n1 1 2 2 3", output: "3", score: 3, visible: true },
        { input: "1\n5", output: "1", score: 2, visible: false },
        { input: "6\n0 0 1 1 1 2", output: "3", score: 3, visible: true },
      ],
    },
    scaffolds: [
      {
        languageId: 62, languageName: "Java 17",
        body:
`import java.util.*;
public class Main{
  static int solve(int[] a){
    // TODO: Remove duplicates in-place and return new length
    return 0;
  }
  public static void main(String[] args){
    Scanner sc=new Scanner(System.in);
    int n=sc.nextInt(); int[] a=new int[n];
    for(int i=0;i<n;i++) a[i]=sc.nextInt();
    System.out.println(solve(a));
  }
}`
      },
      {
        languageId: 71, languageName: "Python 3.8",
        body:
`def solve(a):
    # TODO: Remove duplicates and return new length
    return 0

import sys
d=list(map(int,sys.stdin.read().strip().split()))
n=d[0]; a=d[1:1+n]
print(solve(a))`
      }
    ]
  },

  {
    question: {
      title: "Longest Substring Without Repeating Characters",
      description: "Given s, return length of the longest substring without repeating characters.",
      difficulty: "Medium",
      tags: ["sliding-window", "strings"],
      sampleInput: "abcabcbb",
      sampleOutput: "3",
      timeLimit: 2,
      memoryLimit: 128,
      maxCodeSize: 128,
      timeAllowed: 12,
      maxAttempts: 3,
      testCases: [
        { input: "abcabcbb", output: "3", score: 3, visible: true },
        { input: "bbbbb", output: "1", score: 3, visible: false },
        { input: "pwwkew", output: "3", score: 3, visible: true },
        { input: "", output: "0", score: 1, visible: false },
      ],
    },
    scaffolds: [
      {
        languageId: 62, languageName: "Java 17",
        body:
`import java.io.*;
public class Main{
  static int solve(String s){
    // TODO: Return required length
    return 0;
  }
  public static void main(String[] args)throws Exception{
    String s=new BufferedReader(new InputStreamReader(System.in)).readLine();
    if(s==null) s="";
    System.out.println(solve(s));
  }
}`
      },
      {
        languageId: 71, languageName: "Python 3.8",
        body:
`def solve(s: str) -> int:
    # TODO: Return required length
    return 0

s=input()
print(solve(s))`
      }
    ]
  },

  {
    question: {
      title: "Set Matrix Zeroes",
      description: "If any element is 0, set its entire row and column to 0. Print the matrix.",
      difficulty: "Medium",
      tags: ["matrix"],
      sampleInput: "3 3\n1 1 1\n1 0 1\n1 1 1",
      sampleOutput: "1 0 1\n0 0 0\n1 0 1",
      timeLimit: 2,
      memoryLimit: 128,
      maxCodeSize: 128,
      timeAllowed: 12,
      maxAttempts: 3,
      testCases: [
        { input: "3 3\n1 1 1\n1 0 1\n1 1 1", output: "1 0 1\n0 0 0\n1 0 1", score: 3, visible: true },
        { input: "2 2\n0 1\n1 1", output: "0 0\n0 1", score: 3, visible: false },
        { input: "1 3\n0 2 3", output: "0 0 0", score: 2, visible: true },
      ],
    },
    scaffolds: [
      {
        languageId: 62, languageName: "Java 17",
        body:
`import java.util.*;
public class Main{
  static int[][] solve(int[][] a, int r, int c){
    // TODO: Modify and return matrix with zeroed rows/cols
    return a;
  }
  public static void main(String[] args){
    Scanner sc=new Scanner(System.in);
    int r=sc.nextInt(), c=sc.nextInt();
    int[][] a=new int[r][c];
    for(int i=0;i<r;i++) for(int j=0;j<c;j++) a[i][j]=sc.nextInt();
    int[][] res=solve(a,r,c);
    for(int i=0;i<r;i++){
      for(int j=0;j<c;j++){
        if(j>0) System.out.print(" ");
        System.out.print(res[i][j]);
      }
      System.out.println();
    }
  }
}`
      },
      {
        languageId: 71, languageName: "Python 3.8",
        body:
`def solve(mat, r, c):
    # TODO: Zero rows/cols and return matrix
    return mat

import sys
d=list(map(int,sys.stdin.read().strip().split()))
r,c=d[0],d[1]; vals=d[2:]
a=[vals[i*c:(i+1)*c] for i in range(r)]
res=solve(a,r,c)
for row in res: print(*row)`
      }
    ]
  },

  {
    question: {
      title: "Spiral Matrix Print",
      description: "Print matrix elements in spiral order, space-separated.",
      difficulty: "Medium",
      tags: ["matrix", "simulation"],
      sampleInput: "3 3\n1 2 3\n4 5 6\n7 8 9",
      sampleOutput: "1 2 3 6 9 8 7 4 5",
      timeLimit: 2,
      memoryLimit: 128,
      maxCodeSize: 128,
      timeAllowed: 12,
      maxAttempts: 3,
      testCases: [
        { input: "3 3\n1 2 3\n4 5 6\n7 8 9", output: "1 2 3 6 9 8 7 4 5", score: 3, visible: true },
        { input: "1 4\n1 2 3 4", output: "1 2 3 4", score: 2, visible: false },
        { input: "2 3\n1 2 3\n4 5 6", output: "1 2 3 6 5 4", score: 3, visible: true },
      ],
    },
    scaffolds: [
      {
        languageId: 62, languageName: "Java 17",
        body:
`import java.util.*;
public class Main{
  static String solve(int[][] a, int r, int c){
    // TODO: Return spiral order as space-separated string
    return "";
  }
  public static void main(String[] args){
    Scanner sc=new Scanner(System.in);
    int r=sc.nextInt(), c=sc.nextInt();
    int[][] a=new int[r][c];
    for(int i=0;i<r;i++) for(int j=0;j<c;j++) a[i][j]=sc.nextInt();
    System.out.println(solve(a,r,c));
  }
}`
      },
      {
        languageId: 71, languageName: "Python 3.8",
        body:
`def solve(mat, r, c) -> str:
    # TODO: Return spiral as space-separated string
    return ""

import sys
d=list(map(int,sys.stdin.read().strip().split()))
r,c=d[0],d[1]; vals=d[2:]
a=[vals[i*c:(i+1)*c] for i in range(r)]
print(solve(a,r,c))`
      }
    ]
  },

  {
    question: {
      title: "Power of Two",
      description: "Given integer n, print true if it is a power of two; else false.",
      difficulty: "Easy",
      tags: ["bit-manipulation"],
      sampleInput: "16",
      sampleOutput: "true",
      timeLimit: 1,
      memoryLimit: 64,
      maxCodeSize: 64,
      timeAllowed: 5,
      maxAttempts: 3,
      testCases: [
        { input: "1", output: "true", score: 2, visible: true },
        { input: "16", output: "true", score: 2, visible: false },
        { input: "3", output: "false", score: 2, visible: true },
        { input: "0", output: "false", score: 1, visible: false },
      ],
    },
    scaffolds: [
      {
        languageId: 62, languageName: "Java 17",
        body:
`import java.util.*;
public class Main {
  static String solve(long n) {
    // TODO: Return "true" if n is power of two else "false"
    return "false";
  }
  public static void main(String[] args) {
    long n=new Scanner(System.in).nextLong();
    System.out.println(solve(n));
  }
}`
      },
      {
        languageId: 71, languageName: "Python 3.8",
        body:
`def solve(n: int) -> str:
    # TODO: Return "true" if power of two else "false"
    return "false"

n=int(input())
print(solve(n))`
      }
    ]
  },

  {
    question: {
      title: "Trailing Zeros in Factorial",
      description: "Given n, compute number of trailing zeros in n!.",
      difficulty: "Medium",
      tags: ["math"],
      sampleInput: "10",
      sampleOutput: "2",
      timeLimit: 1,
      memoryLimit: 64,
      maxCodeSize: 64,
      timeAllowed: 8,
      maxAttempts: 3,
      testCases: [
        { input: "3", output: "0", score: 2, visible: true },
        { input: "5", output: "1", score: 2, visible: false },
        { input: "10", output: "2", score: 2, visible: true },
        { input: "100", output: "24", score: 3, visible: false },
      ],
    },
    scaffolds: [
      {
        languageId: 62, languageName: "Java 17",
        body:
`import java.util.*;
public class Main{
  static long solve(long n){
    // TODO: Return number of trailing zeros in n!
    return 0L;
  }
  public static void main(String[] args){
    long n=new Scanner(System.in).nextLong();
    System.out.println(solve(n));
  }
}`
      },
      {
        languageId: 71, languageName: "Python 3.8",
        body:
`def solve(n: int) -> int:
    # TODO: Return count of trailing zeros in n!
    return 0

n=int(input())
print(solve(n))`
      }
    ]
  },

  {
    question: {
      title: "Balanced Binary String",
      description: "Given a string of 'L' and 'R', split into max number of balanced substrings. Print the count.",
      difficulty: "Medium",
      tags: ["greedy", "strings"],
      sampleInput: "RLRRLLRLRL",
      sampleOutput: "4",
      timeLimit: 1,
      memoryLimit: 64,
      maxCodeSize: 128,
      timeAllowed: 10,
      maxAttempts: 3,
      testCases: [
        { input: "RLRRLLRLRL", output: "4", score: 3, visible: true },
        { input: "RLLLLRRRLR", output: "3", score: 3, visible: false },
        { input: "LLLLRRRR", output: "1", score: 2, visible: true },
      ],
    },
    scaffolds: [
      {
        languageId: 62, languageName: "Java 17",
        body:
`import java.io.*;
public class Main{
  static int solve(String s){
    // TODO: Return number of balanced substrings
    return 0;
  }
  public static void main(String[] args)throws Exception{
    String s=new BufferedReader(new InputStreamReader(System.in)).readLine();
    System.out.println(solve(s));
  }
}`
      },
      {
        languageId: 71, languageName: "Python 3.8",
        body:
`def solve(s: str) -> int:
    # TODO: Return number of balanced substrings
    return 0

s=input().strip()
print(solve(s))`
      }
    ]
  },

  {
    question: {
      title: "Move Zeroes",
      description: "Move all zeroes to the end while maintaining the relative order of non-zero elements.",
      difficulty: "Easy",
      tags: ["two-pointers", "arrays"],
      sampleInput: "5\n0 1 0 3 12",
      sampleOutput: "1 3 12 0 0",
      timeLimit: 1,
      memoryLimit: 64,
      maxCodeSize: 64,
      timeAllowed: 6,
      maxAttempts: 3,
      testCases: [
        { input: "5\n0 1 0 3 12", output: "1 3 12 0 0", score: 2, visible: true },
        { input: "4\n0 0 1 2", output: "1 2 0 0", score: 2, visible: false },
        { input: "1\n0", output: "0", score: 1, visible: true },
      ],
    },
    scaffolds: [
      {
        languageId: 62, languageName: "Java 17",
        body:
`import java.util.*;
public class Main{
  static int[] solve(int[] a){
    // TODO: Move zeroes to end, return array
    return a;
  }
  public static void main(String[] args){
    Scanner sc=new Scanner(System.in);
    int n=sc.nextInt(); int[] a=new int[n];
    for(int i=0;i<n;i++) a[i]=sc.nextInt();
    int[] res=solve(a);
    for(int i=0;i<res.length;i++){
      if(i>0) System.out.print(" ");
      System.out.print(res[i]);
    }
  }
}`
      },
      {
        languageId: 71, languageName: "Python 3.8",
        body:
`def solve(a):
    # TODO: Move zeroes to end, return list
    return a

import sys
d=list(map(int,sys.stdin.read().strip().split()))
n=d[0]; a=d[1:1+n]
print(*solve(a))`
      }
    ]
  },

  {
    question: {
      title: "First Non-Repeating Character",
      description: "Given a string s, print index of first non-repeating character, or -1.",
      difficulty: "Easy",
      tags: ["strings", "hashmap"],
      sampleInput: "leetcode",
      sampleOutput: "0",
      timeLimit: 1,
      memoryLimit: 64,
      maxCodeSize: 64,
      timeAllowed: 6,
      maxAttempts: 3,
      testCases: [
        { input: "leetcode", output: "0", score: 2, visible: true },
        { input: "loveleetcode", output: "2", score: 2, visible: false },
        { input: "aabb", output: "-1", score: 2, visible: true },
      ],
    },
    scaffolds: [
      {
        languageId: 62, languageName: "Java 17",
        body:
`import java.io.*;
public class Main{
  static int solve(String s){
    // TODO: Return index or -1
    return -1;
  }
  public static void main(String[] args)throws Exception{
    String s=new BufferedReader(new InputStreamReader(System.in)).readLine();
    System.out.println(solve(s));
  }
}`
      },
      {
        languageId: 71, languageName: "Python 3.8",
        body:
`def solve(s: str) -> int:
    # TODO: Return index or -1
    return -1

s=input()
print(solve(s))`
      }
    ]
  },

  {
    question: {
      title: "Plus One",
      description: "Given n and an array representing a non-negative integer, add one and print resulting digits.",
      difficulty: "Easy",
      tags: ["arrays"],
      sampleInput: "3\n1 2 9",
      sampleOutput: "1 3 0",
      timeLimit: 1,
      memoryLimit: 64,
      maxCodeSize: 64,
      timeAllowed: 5,
      maxAttempts: 3,
      testCases: [
        { input: "3\n1 2 9", output: "1 3 0", score: 2, visible: true },
        { input: "1\n9", output: "1 0", score: 2, visible: false },
        { input: "4\n9 9 9 9", output: "1 0 0 0 0", score: 3, visible: true },
      ],
    },
    scaffolds: [
      {
        languageId: 62, languageName: "Java 17",
        body:
`import java.util.*;
public class Main{
  static int[] solve(int[] a){
    // TODO: Add one and return digits
    return a;
  }
  public static void main(String[] args){
    Scanner sc=new Scanner(System.in);
    int n=sc.nextInt(); int[] a=new int[n];
    for(int i=0;i<n;i++) a[i]=sc.nextInt();
    int[] res=solve(a);
    for(int i=0;i<res.length;i++){
      if(i>0) System.out.print(" ");
      System.out.print(res[i]);
    }
  }
}`
      },
      {
        languageId: 71, languageName: "Python 3.8",
        body:
`def solve(a):
    # TODO: Add one; return resulting digits
    return a

import sys
d=list(map(int,sys.stdin.read().strip().split()))
n=d[0]; a=d[1:1+n]
print(*solve(a))`
      }
    ]
  },

  {
    question: {
      title: "Merge Two Sorted Arrays",
      description: "Given two sorted arrays, merge them and print the merged sorted sequence.",
      difficulty: "Easy",
      tags: ["merge", "arrays"],
      sampleInput: "3 3\n1 3 5\n2 4 6",
      sampleOutput: "1 2 3 4 5 6",
      timeLimit: 2,
      memoryLimit: 128,
      maxCodeSize: 64,
      timeAllowed: 6,
      maxAttempts: 3,
      testCases: [
        { input: "3 3\n1 3 5\n2 4 6", output: "1 2 3 4 5 6", score: 2, visible: true },
        { input: "1 0\n5\n", output: "5", score: 1, visible: false },
        { input: "0 1\n\n7", output: "7", score: 1, visible: true },
      ],
    },
    scaffolds: [
      {
        languageId: 62, languageName: "Java 17",
        body:
`import java.io.*;import java.util.*;
public class Main{
  static int[] solve(int[] a, int[] b){
    // TODO: Merge and return
    return new int[0];
  }
  public static void main(String[] args)throws Exception{
    BufferedReader br=new BufferedReader(new InputStreamReader(System.in));
    String[] nm=br.readLine().trim().split("\\\\s+");
    int n=Integer.parseInt(nm[0]), m=Integer.parseInt(nm[1]);
    int[] a=new int[n], b=new int[m];
    if(n>0){String[] sa=(br.readLine()+" ").trim().split("\\\\s+"); for(int i=0;i<n;i++) a[i]=Integer.parseInt(sa[i]);}
    else br.readLine();
    if(m>0){String[] sb=(br.readLine()+" ").trim().split("\\\\s+"); for(int i=0;i<m;i++) b[i]=Integer.parseInt(sb[i]);}
    int[] res=solve(a,b);
    for(int i=0;i<res.length;i++){ if(i>0) System.out.print(" "); System.out.print(res[i]); }
  }
}`
      },
      {
        languageId: 71, languageName: "Python 3.8",
        body:
`def solve(a, b):
    # TODO: Merge and return list
    return []

import sys
it=iter(sys.stdin.read().strip().split())
n=int(next(it)); m=int(next(it))
a=[int(next(it)) for _ in range(n)] if n else []
b=[int(next(it)) for _ in range(m)] if m else []
print(*solve(a,b))`
      }
    ]
  },

  {
    question: {
      title: "Matrix: Number of Islands",
      description: "Given r c and a grid of 0/1, count the number of connected 1-islands (4-directional).",
      difficulty: "Hard",
      tags: ["graph", "dfs", "bfs"],
      sampleInput: "3 3\n1 1 0\n0 1 0\n1 0 1",
      sampleOutput: "3",
      timeLimit: 3,
      memoryLimit: 256,
      maxCodeSize: 256,
      timeAllowed: 15,
      maxAttempts: 3,
      testCases: [
        { input: "1 1\n0", output: "0", score: 2, visible: true },
        { input: "1 1\n1", output: "1", score: 2, visible: false },
        { input: "3 3\n1 1 0\n0 1 0\n1 0 1", output: "3", score: 3, visible: true },
        { input: "3 4\n1 0 1 0\n0 1 0 1\n1 0 1 0", output: "6", score: 3, visible: false },
      ],
    },
    scaffolds: [
      {
        languageId: 62, languageName: "Java 17",
        body:
`import java.util.*;
public class Main{
  static int solve(int[][] g, int r, int c){
    // TODO: Count islands using DFS/BFS (4-dir)
    return 0;
  }
  public static void main(String[] args){
    Scanner sc=new Scanner(System.in);
    int r=sc.nextInt(), c=sc.nextInt();
    int[][] g=new int[r][c];
    for(int i=0;i<r;i++) for(int j=0;j<c;j++) g[i][j]=sc.nextInt();
    System.out.println(solve(g,r,c));
  }
}`
      },
      {
        languageId: 71, languageName: "Python 3.8",
        body:
`def solve(g, r, c):
    # TODO: Count 4-dir islands via DFS/BFS
    return 0

import sys
d=list(map(int,sys.stdin.read().strip().split()))
r,c=d[0],d[1]; vals=d[2:]
g=[vals[i*c:(i+1)*c] for i in range(r)]
print(solve(g,r,c))`
      }
    ]
  },

  {
    question: {
      title: "Word Ladder (Length)",
      description: "Given beginWord, endWord, and word list size n and then n words, return the length of shortest transformation sequence or 0.",
      difficulty: "Hard",
      tags: ["bfs", "graphs"],
      sampleInput: "hit\ncog\n6\nhot\ndot\ndog\nlot\nlog\ncog",
      sampleOutput: "5",
      timeLimit: 3,
      memoryLimit: 256,
      maxCodeSize: 256,
      timeAllowed: 20,
      maxAttempts: 3,
      testCases: [
        { input: "hit\ncog\n6\nhot\ndot\ndog\nlot\nlog\ncog", output: "5", score: 4, visible: true },
        { input: "hit\ncog\n5\nhot\ndot\ndog\nlot\nlog", output: "0", score: 4, visible: false },
        { input: "a\nc\n3\na\nb\nc", output: "2", score: 2, visible: true },
      ],
    },
    scaffolds: [
      {
        languageId: 62, languageName: "Java 17",
        body:
`import java.io.*;import java.util.*;
public class Main{
  static int solve(String begin, String end, List<String> words){
    // TODO: BFS over word patterns
    return 0;
  }
  public static void main(String[] args)throws Exception{
    BufferedReader br=new BufferedReader(new InputStreamReader(System.in));
    String begin=br.readLine().trim();
    String end=br.readLine().trim();
    int n=Integer.parseInt(br.readLine().trim());
    List<String> words=new ArrayList<>();
    for(int i=0;i<n;i++) words.add(br.readLine().trim());
    System.out.println(solve(begin,end,words));
  }
}`
      },
      {
        languageId: 71, languageName: "Python 3.8",
        body:
`def solve(begin, end, words):
    # TODO: BFS shortest transformation length
    return 0

begin=input().strip()
end=input().strip()
n=int(input().strip())
words=[input().strip() for _ in range(n)]
print(solve(begin,end,words))`
      }
    ]
  },

  {
    question: {
      title: "Minimum Window Substring",
      description: "Given s and t (two lines), return the minimum window in s which contains all characters of t. If no such window, print empty string.",
      difficulty: "Hard",
      tags: ["sliding-window", "strings"],
      sampleInput: "ADOBECODEBANC\nABC",
      sampleOutput: "BANC",
      timeLimit: 3,
      memoryLimit: 256,
      maxCodeSize: 256,
      timeAllowed: 20,
      maxAttempts: 3,
      testCases: [
        { input: "ADOBECODEBANC\nABC", output: "BANC", score: 4, visible: true },
        { input: "a\na", output: "a", score: 2, visible: true },
        { input: "a\naa", output: "", score: 2, visible: false },
        { input: "ab\nb", output: "b", score: 2, visible: false },
      ],
    },
    scaffolds: [
      {
        languageId: 62, languageName: "Java 17",
        body:
`import java.io.*;
public class Main{
  static String solve(String s, String t){
    // TODO: Sliding window min cover
    return "";
  }
  public static void main(String[] args)throws Exception{
    BufferedReader br=new BufferedReader(new InputStreamReader(System.in));
    String s=br.readLine(), t=br.readLine();
    System.out.println(solve(s,t));
  }
}`
      },
      {
        languageId: 71, languageName: "Python 3.8",
        body:
`def solve(s: str, t: str) -> str:
    # TODO: Sliding window minimum cover
    return ""

s=input().strip()
t=input().strip()
print(solve(s,t))`
      }
    ]
  },
];

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