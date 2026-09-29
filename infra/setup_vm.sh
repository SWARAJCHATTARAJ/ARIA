#!/bin/bash
set -e

# ARIA v2 Azure VM Setup Script

echo "Updating packages..."
sudo apt-get update && sudo apt-get upgrade -y

echo "Installing Redis & Python..."
sudo apt-get install -y redis-server python3-pip python3-venv debian-keyring debian-archive-keyring apt-transport-https

echo "Installing Caddy..."
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update
sudo apt-get install caddy -y

echo "Setting up ARIA user and directories..."
sudo useradd -m -s /bin/bash aria || true
sudo mkdir -p /opt/aria/backend /opt/dristi
sudo chown -R aria:aria /opt/aria /opt/dristi

echo "Setup complete. Please copy code to /opt/aria/backend, setup the virtualenv, and start services."
