#!/bin/bash
# Manual fix for corrupted package.json

echo "🔧 Manual fix for DREX..."

cd /moneyball/drex

# First, check what's in package.json
echo "Current package.json content:"
cat package.json

echo -e "\n📝 Creating fresh package.json..."
cat > package.json << 'EOF'
{
  "name": "drex",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "concurrently \"npm run api\" \"vite\"",
    "api": "node src/api/monitor.js",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "start": "concurrently \"npm run api\" \"npm run preview\""
  },
  "dependencies": {
    "preact": "^10.23.2",
    "express": "^5.1.0",
    "cors": "^2.8.5",
    "mysql2": "^3.14.2",
    "dotenv": "^17.2.0",
    "concurrently": "^9.2.0"
  },
  "devDependencies": {
    "@preact/preset-vite": "^2.9.1",
    "@types/node": "^22.8.7",
    "typescript": "^5.5.3",
    "vite": "^5.4.10"
  }
}
EOF

echo "✅ Created fresh package.json"

# Install any missing dependencies
echo "📦 Installing dependencies..."
npm install

# Build the app
echo "🏗️ Building DREX..."
npm run build

# Restart service
echo "🔄 Restarting service..."
sudo systemctl restart drex

echo "
✅ Manual fix complete!

Check the service: sudo systemctl status drex
View logs: sudo journalctl -u drex -f
"