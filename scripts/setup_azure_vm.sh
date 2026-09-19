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
# Run Uvicorn on localhost:8000 instead of public Port 80
ExecStart=$(pwd)/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable aria.service
sudo systemctl restart aria.service

# f. Setup Nginx Reverse Proxy & SSL
echo "Installing Nginx and Certbot for SSL..."
sudo apt install nginx certbot python3-certbot-nginx -y

echo "Configuring Nginx Reverse Proxy..."
cat <<EOF | sudo tee /etc/nginx/sites-available/aria
server {
    listen 80;
    server_name _; # Replace with your domain name (e.g. api.yourdomain.com)

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

# Enable the site and restart Nginx
sudo ln -sf /etc/nginx/sites-available/aria /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo systemctl restart nginx

echo "====================================================="
echo "FastAPI backend is now running safely behind Nginx!"
echo "To enable full HTTPS/SSL, point your domain to this VM's IP,"
echo "then run this exact command on the VM:"
echo "sudo certbot --nginx -d yourdomain.com"
echo "====================================================="
