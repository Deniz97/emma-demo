#!/bin/bash
# Script to setup Caddy reverse proxy for domain mapping

set -e

DOMAIN=${1:-emma-demo.kodhouse.com}
APP_PORT=${2:-3000}
CADDY_CONTAINER=${3:-caddy-proxy}

echo "Setting up reverse proxy for $DOMAIN -> localhost:$APP_PORT"

# Check if Caddy container exists
if docker ps -a | grep -q $CADDY_CONTAINER; then
    echo "Stopping existing Caddy container..."
    docker stop $CADDY_CONTAINER 2>/dev/null || true
    docker rm $CADDY_CONTAINER 2>/dev/null || true
fi

# Create Caddyfile
cat > /tmp/Caddyfile <<EOF
$DOMAIN {
    reverse_proxy localhost:$APP_PORT
}
EOF

echo "Starting Caddy reverse proxy..."
docker run -d \
    --name $CADDY_CONTAINER \
    --restart unless-stopped \
    --network host \
    -v /tmp/Caddyfile:/etc/caddy/Caddyfile \
    -v caddy_data:/data \
    -v caddy_config:/config \
    caddy:latest

echo "✓ Caddy proxy started successfully"
echo "✓ $DOMAIN is now mapped to localhost:$APP_PORT"
echo ""
echo "Make sure DNS A record for $DOMAIN points to this server's IP"
echo "Caddy will automatically handle HTTPS with Let's Encrypt"

