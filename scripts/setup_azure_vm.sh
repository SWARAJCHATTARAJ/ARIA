#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

echo "Starting Azure VM setup..."

# a. System update
echo "Updating and upgrading system packages..."
sudo apt update && sudo apt upgrade -y

# b. Package installation
echo "Installing python3-pip, python3-venv, and git..."
sudo apt install python3-pip python3-venv git -y

# c. Creation and activation of a Python virtual environment
echo "Creating and activating virtual environment..."
python3 -m venv venv
source venv/bin/activate

# d. Dependency installation
echo "Installing dependencies from requirements.txt..."
pip install -r requirements.txt

# e. Setup systemd service for production deployment
echo "Configuring systemd service for FastAPI..."
cat <<EOF | sudo tee /etc/systemd/system/aria.service
[Unit]
Description=ARIA FastAPI Backend
After=network.target

[Service]
User=$USER
Group=www-data
WorkingDirectory=$(pwd)
Environment="PATH=$(pwd)/venv/bin"
ExecStart=$(pwd)/venv/bin/uvicorn main:app --host 0.0.0.0 --port 80
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable aria.service
sudo systemctl start aria.service
echo "FastAPI server started successfully via systemd on Port 80."
