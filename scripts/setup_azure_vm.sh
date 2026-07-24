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

# e. Startup command to launch the FastAPI server on Port 80 using Uvicorn
echo "Starting FastAPI server on Port 80..."
sudo venv/bin/uvicorn main:app --host 0.0.0.0 --port 80
