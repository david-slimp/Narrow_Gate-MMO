#!/bin/bash
set -e  # Exit on error

# Load environment variables
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
else
    echo "Error: .env file not found. Please create it from .env.example"
    exit 1
fi

# Build the production version
echo "🔨 Building production version..."
NODE_OPTIONS=--max-old-space-size=4096 npm run build

# Deploy using rsync (server-side files only)
echo "🚀 Deploying server files to production server..."
rsync -avz --progress \
    favicon-fullSize.png \
    monsters.conf \
    narrow_gate.conf \
    package.json \
    package-lock.json \
    public \
    server.js \
    ${DEPLOY_USER}@${DEPLOY_SERVER}:${DEPLOY_PATH}

echo "📦 Installing production dependencies on server..."
ssh ${DEPLOY_USER}@${DEPLOY_SERVER} "cd ${DEPLOY_PATH} && npm ci --omit=dev"

echo "✅ Deployment complete!"
echo "🌐 Visit: http://MinistriesForChrist.net:26472/"
