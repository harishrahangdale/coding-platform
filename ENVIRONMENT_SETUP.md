# Environment Configuration Guide

This project uses environment variables to manage different configurations for development and production environments.

## Backend Environment Setup

### Development (.env)
Create a `backend/.env` file with the following content:

```env
# Backend Environment Configuration
NODE_ENV=development
PORT=5050

# Database
MONGO_URI=mongodb://localhost:27017/qbank

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:3000

# Judge0 API
JUDGE0_API_KEY=your_judge0_api_key_here

# Gemini API (for question generation)
GEMINI_API_KEY=your_gemini_api_key_here
API_KEY=your_gemini_api_key_here

# Question Generation Settings
INPUT_FILE=questions.xlsx
SHEET_NAME=null
BATCH_SIZE=1
TOTAL_TO_GENERATE=100
TOPICS_PER_ROUND=12
MAX_RETRIES=3
PREVIEW=true
```

### Production (Render)
Set these environment variables in your Render dashboard:

```env
NODE_ENV=production
PORT=5050
MONGO_URI=your_production_mongodb_uri
FRONTEND_URL=https://your-netlify-app.netlify.app
JUDGE0_API_KEY=your_judge0_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
API_KEY=your_gemini_api_key_here
INPUT_FILE=questions.xlsx
SHEET_NAME=null
BATCH_SIZE=1
TOTAL_TO_GENERATE=100
TOPICS_PER_ROUND=12
MAX_RETRIES=3
PREVIEW=false
```

## Frontend Environment Setup

### Development (.env)
Create a `frontend/.env` file with the following content:

```env
# Frontend Environment Configuration
REACT_APP_API_BASE_URL=http://localhost:5050/api
REACT_APP_NODE_ENV=development
```

### Production (Netlify)
Set these environment variables in your Netlify dashboard:

```env
REACT_APP_API_BASE_URL=https://coding-platform-teq9.onrender.com/api
REACT_APP_NODE_ENV=production
```

## How It Works

### Backend CORS Configuration
The backend automatically configures CORS based on the environment:
- **Development**: Allows localhost:3000, 127.0.0.1:3000, and the FRONTEND_URL
- **Production**: Only allows the FRONTEND_URL (your Netlify domain)
- **No hardcoded URLs**: All URLs are configured via environment variables

### Frontend API Configuration
The frontend uses `REACT_APP_API_BASE_URL` to determine which backend to connect to:
- **Development**: Points to `http://localhost:5050/api` (from .env)
- **Production**: Points to your production backend URL (from environment variables)
- **No hardcoded URLs**: All URLs are configured via environment variables

## Deployment Instructions

### 1. Backend (Render)
1. Set all the production environment variables in your Render dashboard
2. Deploy your code
3. The backend will automatically use production settings

### 2. Frontend (Netlify)
1. Set the production environment variables in your Netlify dashboard
2. Deploy your code
3. The frontend will automatically connect to the production backend

## Local Development

1. **Backend**: Copy `backend/.env.example` to `backend/.env` and update with your values
2. **Frontend**: Copy `frontend/.env.example` to `frontend/.env` and update with your values
3. Run `cd backend && node index.js` to start the backend
4. Run `cd frontend && npm start` to start the frontend

## Environment Files

- `backend/.env.example` - Template for backend development
- `backend/.env.production.example` - Template for backend production
- `frontend/.env.example` - Template for frontend development
- `frontend/.env.production` - Production frontend configuration
- `frontend/.env` - Local development frontend configuration (gitignored)
- `backend/.env` - Local development backend configuration (gitignored)
