# 🚀 Coding Platform - HackerEarth/HackerRank Clone

A comprehensive online coding assessment platform built with React.js, Node.js, and MongoDB. Features real-time code execution, session replay, AI-powered code analysis, and modern UI/UX.

## 🌟 Features

### 🎯 Core Functionality
- **Real-time Code Editor** with Monaco Editor
- **Multi-language Support** (Java, Python, JavaScript, C++, C)
- **Code Execution** via Judge0 API integration
- **Test Case Management** with visible/hidden test cases
- **Timer-based Sessions** with auto-submission
- **Attempt Limiting** per question
- **Auto-save** functionality for code drafts

### 🎬 Session Replay System
- **Complete Activity Recording** - captures every keystroke, cursor movement, and selection
- **Timeline-based Playback** with pause markers and run indicators
- **Video Player Interface** for reviewing candidate sessions
- **Event Timeline** with colored markers for different activities
- **Seekable Timeline** with progress indicators

### 🤖 AI-Powered Analysis
- **Code Quality Assessment** using Gemini AI
- **Logical Correctness Analysis** with detailed feedback
- **Performance Evaluation** and optimization suggestions
- **Background Processing** - analysis runs without blocking UI
- **Comprehensive Reports** with strengths, weaknesses, and recommendations

### 📊 Submission Management
- **Detailed Submission History** with filtering and search
- **Test Case Results** with pass/fail status
- **Performance Metrics** (time, memory usage)
- **Code Analysis Integration** in submission details
- **Session Replay Integration** for each submission

### 🎨 Modern UI/UX
- **Responsive Design** with Tailwind CSS
- **Dark/Light Theme** toggle
- **Modern Card-based Layout** for questions and submissions
- **Interactive Timers** with visual indicators
- **Modal System** for notifications and confirmations
- **Smooth Animations** and transitions

## 🛠️ Tech Stack

### Frontend
- **React.js** 18+ with functional components and hooks
- **Monaco Editor** for code editing
- **Tailwind CSS** for styling
- **Axios** for API communication
- **React Router** for navigation

### Backend
- **Node.js** with Express.js
- **MongoDB** with Mongoose ODM
- **CORS** for cross-origin requests
- **dotenv** for environment management

### External APIs
- **Judge0 API** for code execution
- **Gemini AI** for code analysis
- **RapidAPI** for Judge0 integration

### Database Models
- **Question** - Coding problems with test cases
- **Submission** - User code submissions with results
- **SubmissionDraft** - Auto-saved code drafts
- **EditorSession** - Session replay event data
- **Scaffold** - Code templates for different languages
- **AIQuestions** - AI-generated questions

## 🚀 Getting Started

### Prerequisites
- Node.js 16+ 
- MongoDB 4.4+
- RapidAPI account for Judge0
- Google AI API key for Gemini

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd coding-platform
```

2. **Backend Setup**
```bash
cd backend
npm install
cp .env.example .env
# Configure your environment variables
npm start
```

3. **Frontend Setup**
```bash
cd frontend
npm install
cp .env.example .env
# Configure your environment variables
npm start
```

### Environment Variables

**Backend (.env)**
```env
MONGO_URI=mongodb://localhost:27017/coding-platform
JUDGE0_API_KEY=your_rapidapi_key
JUDGE0_HOST=judge0-ce.p.rapidapi.com
GEMINI_API_KEY=your_gemini_api_key
PORT=5050
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
DEV_FRONTEND_URL=http://localhost:3000
```

**Frontend (.env)**
```env
REACT_APP_API_BASE_URL=http://localhost:5050
REACT_APP_NODE_ENV=development
```

## 📁 Project Structure

```
coding-platform/
├── backend/
│   ├── models/           # MongoDB schemas
│   ├── routes/           # API route handlers
│   ├── scripts/          # Database seeding scripts
│   └── index.js          # Main server file
├── frontend/
│   ├── src/
│   │   ├── components/   # React components
│   │   │   ├── Judge0Editor.jsx      # Main code editor
│   │   │   ├── SessionReplayPlayer.jsx # Session replay
│   │   │   ├── EnhancedSessionReplay.jsx # Submission list
│   │   │   ├── SubmissionDetails.jsx # Submission details
│   │   │   └── Modal.jsx            # Modal component
│   │   ├── App.js        # Main app component
│   │   └── index.js      # App entry point
│   └── public/           # Static assets
└── README.md
```

## 🔧 API Endpoints

### Questions
- `GET /api/questions` - List all questions
- `GET /api/questions/:id` - Get question details
- `GET /api/questions/:id/scaffold/:languageId` - Get code scaffold

### Submissions
- `POST /api/run/:id` - Submit code for evaluation
- `POST /api/run-only/:id` - Run code without submission
- `GET /api/submissions` - List submissions with pagination
- `GET /api/submissions/:id` - Get submission details

### Session Management
- `POST /api/editor-sessions` - Save editor session events
- `GET /api/editor-sessions/:sessionId` - Get session for replay
- `POST /api/editor-events` - Append events to session

### Code Analysis
- `POST /api/analyze-code` - Analyze code with AI

## 🎯 Key Features Implementation

### Session Replay System
The session replay system captures every user interaction in the code editor:
- **Event Types**: Content changes, cursor movements, selections
- **Timeline Markers**: Pause indicators, run attempts, compile errors
- **Playback Controls**: Play, pause, seek, speed control
- **Visual Timeline**: Color-coded markers for different activities

### AI Code Analysis
Integrated Gemini AI for comprehensive code analysis:
- **Logical Correctness**: Algorithm analysis and edge case detection
- **Code Quality**: Readability, maintainability, efficiency assessment
- **Performance Metrics**: Time complexity and optimization suggestions
- **Detailed Feedback**: Strengths, weaknesses, and improvement recommendations

### Timer and Session Management
- **Question-based Timers**: Each question has configurable time limits
- **Auto-submission**: Code is automatically submitted when time expires
- **Session State Management**: Proper session lifecycle with start/end states
- **Attempt Tracking**: Limits on run attempts per question

## 🎨 UI/UX Highlights

### Modern Design System
- **Consistent Color Palette** with semantic color usage
- **Typography Scale** with proper hierarchy
- **Spacing System** using Tailwind's spacing scale
- **Component Library** with reusable UI components

### Responsive Layout
- **Mobile-first Design** with responsive breakpoints
- **Flexible Grid System** for different screen sizes
- **Touch-friendly Controls** for mobile devices

### Interactive Elements
- **Smooth Animations** for state transitions
- **Loading States** with skeleton screens
- **Error Handling** with user-friendly messages
- **Success Feedback** with clear confirmation messages

## 🔒 Security Features

- **CORS Configuration** for secure cross-origin requests
- **Input Validation** on all API endpoints
- **Error Handling** without sensitive information exposure
- **Rate Limiting** for API endpoints (via Judge0)

## 🚀 Deployment

### Backend (Render)
1. Connect GitHub repository
2. Set environment variables
3. Deploy with Node.js buildpack

### Frontend (Netlify)
1. Connect GitHub repository
2. Set build command: `npm run build`
3. Set publish directory: `build`
4. Configure environment variables

## 📊 Performance Optimizations

- **Code Splitting** for better loading performance
- **Lazy Loading** for session replay components
- **Memoization** for expensive calculations
- **Debounced Auto-save** to reduce API calls
- **Background Processing** for AI analysis

## 🧪 Testing

The platform includes comprehensive testing for:
- **API Endpoints** with proper error handling
- **Session Management** with state persistence
- **Code Execution** with various test cases
- **UI Components** with different states

## 🔮 Future Enhancements

- **Real-time Collaboration** for pair programming
- **Advanced Analytics** for performance insights
- **Custom Question Creation** interface
- **Bulk Import/Export** for questions and submissions
- **Advanced Code Analysis** with more AI models
- **Video Recording** integration for sessions

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- **Monaco Editor** for the excellent code editing experience
- **Judge0** for code execution capabilities
- **Gemini AI** for intelligent code analysis
- **Tailwind CSS** for the utility-first CSS framework

---

**Built with ❤️ for the coding community**
