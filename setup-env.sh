#!/bin/bash

# Environment Setup Script
echo "🚀 Setting up environment configuration..."

# Backend setup
echo "📁 Setting up backend environment..."
if [ ! -f "backend/.env" ]; then
    cp backend/.env.example backend/.env
    echo "✅ Created backend/.env from template"
else
    echo "⚠️  backend/.env already exists, skipping..."
fi

# Frontend setup
echo "📁 Setting up frontend environment..."
if [ ! -f "frontend/.env" ]; then
    cp frontend/.env.example frontend/.env
    echo "✅ Created frontend/.env from template"
else
    echo "⚠️  frontend/.env already exists, skipping..."
fi

echo ""
echo "🎉 Environment setup complete!"
echo ""
echo "📝 Next steps:"
echo "1. Update backend/.env with your actual API keys and database URI"
echo "2. Update frontend/.env if needed (defaults should work for local development)"
echo "3. Run 'cd backend && node index.js' to start the backend"
echo "4. Run 'cd frontend && npm start' to start the frontend"
echo ""
echo "📖 See ENVIRONMENT_SETUP.md for detailed configuration instructions"

