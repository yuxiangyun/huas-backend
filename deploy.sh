#!/bin/bash
set -e

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

echo "=== HUAS Server Deploy ==="

# Check bun
if ! command -v bun &> /dev/null; then
    echo "Error: bun is not installed. Install: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

# Check .env
if [ ! -f .env ]; then
    echo "Error: .env file not found. Copy from .env.example and set JWT_SECRET."
    echo "  cp .env.example .env"
    exit 1
fi

# Load .env
set -a; source .env; set +a

if [ "$JWT_SECRET" = "your-random-secret-at-least-32-chars" ] || [ -z "$JWT_SECRET" ]; then
    echo "Error: JWT_SECRET must be changed in .env"
    exit 1
fi

# Create directories
mkdir -p data logs

# Install dependencies
echo "Installing dependencies..."
bun install --frozen-lockfile --production

# Start with PM2
if command -v pm2 &> /dev/null; then
    echo "Starting with PM2..."
    pm2 delete huas-server 2>/dev/null || true
    pm2 start ecosystem.config.cjs
    pm2 save
    echo "Done. Run 'pm2 logs huas-server' to view logs."
else
    echo "PM2 not found. Starting directly..."
    echo "  Install PM2: bun add -g pm2"
    echo "  Or run directly: NODE_ENV=production bun run src/index.ts"
    NODE_ENV=production bun run src/index.ts
fi
