const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB Atlas
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// Question Schema
const questionSchema = new mongoose.Schema({
  title: String,
  description: String,
  difficulty: String,
  language: String,
  timeLimit: Number,   // in minutes to solve the problem
  maxAttempts: Number,
  input1: String,
  output1: String,
  input2: String,
  output2: String,
  input3: String,
  output3: String,
  input4: String,
  output4: String,
  input5: String,
  output5: String,
  constraints: String,
});

const Question = mongoose.model('Question', questionSchema);

// Sample Questions
const questions = [
  // EASY QUESTIONS (10 min)
  {
    title: 'Sum of Two Numbers',
    description: 'Write a function to return the sum of two integers.',
    difficulty: 'Easy',
    language: 'Java',
    timeLimit: 10,
    maxAttempts: 3,
    input1: '2 3', output1: '5',
    input2: '-5 10', output2: '5',
    input3: '100 200', output3: '300',
    input4: '-1000000000 1000000000', output4: '0',
    input5: '7 8', output5: '15',
    constraints: '-10^9 <= a, b <= 10^9',
  },
  {
    title: 'Reverse String',
    description: 'Write a function to reverse a given string.',
    difficulty: 'Easy',
    language: 'Java',
    timeLimit: 10,
    maxAttempts: 3,
    input1: 'hello', output1: 'olleh',
    input2: 'world', output2: 'dlrow',
    input3: 'abc', output3: 'cba',
    input4: 'a', output4: 'a',
    input5: 'openai', output5: 'ianepo',
    constraints: '1 <= s.length <= 10^5',
  },
  {
    title: 'Factorial',
    description: 'Write a function to calculate factorial of a number n.',
    difficulty: 'Easy',
    language: 'Java',
    timeLimit: 10,
    maxAttempts: 3,
    input1: '5', output1: '120',
    input2: '0', output2: '1',
    input3: '1', output3: '1',
    input4: '3', output4: '6',
    input5: '7', output5: '5040',
    constraints: '0 <= n <= 20',
  },
  {
    title: 'Palindrome Check',
    description: 'Write a function to check if a string is a palindrome.',
    difficulty: 'Easy',
    language: 'Java',
    timeLimit: 10,
    maxAttempts: 3,
    input1: 'madam', output1: 'true',
    input2: 'hello', output2: 'false',
    input3: 'racecar', output3: 'true',
    input4: 'a', output4: 'true',
    input5: 'level', output5: 'true',
    constraints: '1 <= s.length <= 10^5',
  },
  {
    title: 'Maximum of Three Numbers',
    description: 'Write a function to return the maximum of three integers.',
    difficulty: 'Easy',
    language: 'Java',
    timeLimit: 10,
    maxAttempts: 3,
    input1: '1 2 3', output1: '3',
    input2: '10 5 7', output2: '10',
    input3: '-1 -2 -3', output3: '-1',
    input4: '100 200 150', output4: '200',
    input5: '9 9 9', output5: '9',
    constraints: '-10^9 <= numbers <= 10^9',
  },

  // MEDIUM QUESTIONS (20 min)
  {
    title: 'Fibonacci Series',
    description: 'Write a function to return the nth Fibonacci number.',
    difficulty: 'Medium',
    language: 'Java',
    timeLimit: 20,
    maxAttempts: 3,
    input1: '5', output1: '5',
    input2: '0', output2: '0',
    input3: '1', output3: '1',
    input4: '10', output4: '55',
    input5: '15', output5: '610',
    constraints: '0 <= n <= 40',
  },
  {
    title: 'Two Sum',
    description: 'Given an array of integers, return indices of two numbers such that they add up to a target.',
    difficulty: 'Medium',
    language: 'Java',
    timeLimit: 20,
    maxAttempts: 3,
    input1: 'nums=[2,7,11,15], target=9', output1: '[0,1]',
    input2: 'nums=[3,2,4], target=6', output2: '[1,2]',
    input3: 'nums=[3,3], target=6', output3: '[0,1]',
    input4: 'nums=[1,2,3,4,5], target=8', output4: '[2,4]',
    input5: 'nums=[5,75,25], target=100', output5: '[1,2]',
    constraints: '2 <= nums.length <= 10^4, -10^9 <= nums[i] <= 10^9',
  },
  {
    title: 'Valid Parentheses',
    description: 'Given a string containing only parentheses characters, determine if it is valid.',
    difficulty: 'Medium',
    language: 'Java',
    timeLimit: 20,
    maxAttempts: 3,
    input1: '()', output1: 'true',
    input2: '()[]{}', output2: 'true',
    input3: '(]', output3: 'false',
    input4: '([)]', output4: 'false',
    input5: '{[]}', output5: 'true',
    constraints: '1 <= s.length <= 10^4',
  },
  {
    title: 'Merge Two Sorted Arrays',
    description: 'Merge two sorted arrays into a single sorted array.',
    difficulty: 'Medium',
    language: 'Java',
    timeLimit: 20,
    maxAttempts: 3,
    input1: '[1,2,3], [2,5,6]', output1: '[1,2,2,3,5,6]',
    input2: '[1], []', output2: '[1]',
    input3: '[], [1]', output3: '[1]',
    input4: '[0], [0]', output4: '[0,0]',
    input5: '[2,4], [1,3,5]', output5: '[1,2,3,4,5]',
    constraints: '0 <= nums1.length, nums2.length <= 10^4',
  },
  {
    title: 'Count Words in a String',
    description: 'Write a function to count the number of words in a given string.',
    difficulty: 'Medium',
    language: 'Java',
    timeLimit: 20,
    maxAttempts: 3,
    input1: 'Hello world', output1: '2',
    input2: 'One two three', output2: '3',
    input3: 'OpenAI', output3: '1',
    input4: 'This is a test', output4: '4',
    input5: 'Count me in', output5: '3',
    constraints: '1 <= s.length <= 10^5',
  },

  // HARD QUESTIONS (30 min)
  {
    title: 'Longest Substring Without Repeating Characters',
    description: 'Given a string s, find the length of the longest substring without repeating characters.',
    difficulty: 'Hard',
    language: 'Java',
    timeLimit: 30,
    maxAttempts: 3,
    input1: 'abcabcbb', output1: '3',
    input2: 'bbbbb', output2: '1',
    input3: 'pwwkew', output3: '3',
    input4: '', output4: '0',
    input5: 'dvdf', output5: '3',
    constraints: '0 <= s.length <= 5 * 10^4',
  },
  {
    title: 'Maximum Subarray Sum',
    description: 'Find the contiguous subarray with the largest sum.',
    difficulty: 'Hard',
    language: 'Java',
    timeLimit: 30,
    maxAttempts: 3,
    input1: '[-2,1,-3,4,-1,2,1,-5,4]', output1: '6',
    input2: '[1]', output2: '1',
    input3: '[5,4,-1,7,8]', output3: '23',
    input4: '[-1]', output4: '-1',
    input5: '[-2,-3,-1]', output5: '-1',
    constraints: '1 <= nums.length <= 10^5, -10^4 <= nums[i] <= 10^4',
  },
  {
    title: 'N-Queens',
    description: 'Place N queens on an NxN chessboard so that no two queens attack each other.',
    difficulty: 'Hard',
    language: 'Java',
    timeLimit: 30,
    maxAttempts: 3,
    input1: '4', output1: '2',
    input2: '1', output2: '1',
    input3: '2', output3: '0',
    input4: '3', output4: '0',
    input5: '5', output5: '10',
    constraints: '1 <= n <= 9',
  },
  {
    title: 'Word Ladder',
    description: 'Given two words (beginWord and endWord), and a dictionary wordList, return the length of shortest transformation sequence.',
    difficulty: 'Hard',
    language: 'Java',
    timeLimit: 30,
    maxAttempts: 3,
    input1: 'begin=hit, end=cog, wordList=[hot,dot,dog,lot,log,cog]', output1: '5',
    input2: 'begin=hit, end=cog, wordList=[hot,dot,dog,lot,log]', output2: '0',
    input3: 'begin=game, end=thee, wordList=[fame,same,tame,theme,thee]', output3: '5',
    input4: 'begin=a, end=c, wordList=[a,b,c]', output4: '2',
    input5: 'begin=red, end=tie, wordList=[ted,tex,red,tax,tad,tie]', output5: '4',
    constraints: '1 <= wordList.length <= 5000',
  },
  {
    title: 'Minimum Window Substring',
    description: 'Given two strings s and t, return the minimum window substring of s that contains all the characters of t.',
    difficulty: 'Hard',
    language: 'Java',
    timeLimit: 30,
    maxAttempts: 3,
    input1: 's=ADOBECODEBANC, t=ABC', output1: 'BANC',
    input2: 's=a, t=a', output2: 'a',
    input3: 's=a, t=aa', output3: '',
    input4: 's=ab, t=b', output4: 'b',
    input5: 's=abc, t=ac', output5: 'abc',
    constraints: '1 <= s.length, t.length <= 10^5',
  },
];

// Insert Questions (replace old)
async function insertQuestions() {
  try {
    console.log('Deleting old questions...');
    await Question.deleteMany({}); // removes everything in the "questions" collection

    console.log('Inserting new questions...');
    await Question.insertMany(questions);

    console.log('Questions replaced successfully ✅');
  } catch (err) {
    console.error('Error inserting questions:', err);
  } finally {
    mongoose.connection.close();
  }
}

insertQuestions();