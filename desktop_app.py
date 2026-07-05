import os
import sys
import time
import socket
from pathlib import Path
from threading import Thread

# Inject pysqlite3 if on Linux
try:
    __import__('pysqlite3')
    import sys as sys_module
    sys_module.modules['sqlite3'] = sys_module.pop('pysqlite3')
except ImportError:
    pass

import uvicorn
import webview
from dotenv import load_dotenv

load_dotenv()

PORT = 8000

def is_port_open(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0

def start_backend():
    # Run uvicorn server serving fastapi and the React dist
    uvicorn.run("main:app", host="127.0.0.1", port=PORT, log_level="warning")

if __name__ == "__main__":
    # Ensure frontend dist folder is built, if not, print warning
    dist_path = Path(__file__).parent / "frontend" / "dist"
    if not dist_path.exists():
        print("[ERROR] frontend/dist folder is missing. Please build the frontend before running the desktop app.")
        sys.exit(1)

    # Start FastAPI server in a background daemon thread
    server_thread = Thread(target=start_backend, daemon=True)
    server_thread.start()

    # Wait for the backend port to open
    for _ in range(100):
        if is_port_open(PORT):
            break
        time.sleep(0.1)
    else:
        print("[ERROR] FastAPI server failed to start on port 8000.")
        sys.exit(1)

    # Start native desktop window wrapper
    print("[INFO] Starting ARIA Desktop App window...")
    webview.create_window(
        "ARIA Research Console",
        f"http://127.0.0.1:{PORT}",
        width=1280,
        height=850,
        resizable=True,
        text_select=True,
        background_color="#0A0A0B"
    )
    webview.start()
