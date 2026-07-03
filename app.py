from __future__ import annotations

import socket
import subprocess
import sys
import time
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components


ROOT = Path(__file__).resolve().parent
BACKEND_HOST = "127.0.0.1"
BACKEND_PORT = 8000
BACKEND_URL = f"http://{BACKEND_HOST}:{BACKEND_PORT}"


st.set_page_config(
    page_title="ARIA Research Console",
    layout="wide",
    initial_sidebar_state="collapsed",
)


def port_is_open(host: str, port: int) -> bool:
    try:
        with socket.create_connection((host, port), timeout=0.25):
            return True
    except OSError:
        return False


@st.cache_resource
def start_backend() -> subprocess.Popen | None:
    if port_is_open(BACKEND_HOST, BACKEND_PORT):
        return None

    dist_index = ROOT / "frontend" / "dist" / "index.html"
    if not dist_index.exists():
        raise FileNotFoundError(
            "frontend/dist/index.html was not found. Run `npm ci` and `npm run build` inside the frontend folder."
        )

    python = ROOT / ".venv" / "Scripts" / "python.exe"
    if not python.exists():
        python = Path(sys.executable)

    process = subprocess.Popen(
        [str(python), "main.py"],
        cwd=str(ROOT),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
    )

    for _ in range(40):
        if port_is_open(BACKEND_HOST, BACKEND_PORT):
            return process
        time.sleep(0.25)

    raise RuntimeError("FastAPI backend did not start on port 8000.")


st.markdown(
    """
    <style>
    html, body, .stApp, [data-testid="stAppViewContainer"], [data-testid="stMain"] {
        width: 100vw !important;
        height: 100vh !important;
        min-height: 100vh !important;
        overflow: hidden !important;
        background: #0A0A0B !important;
    }
    [data-testid="stHeader"], [data-testid="stToolbar"], #MainMenu, footer,
    [data-testid="stDecoration"], [data-testid="stStatusWidget"] {
        display: none !important;
        visibility: hidden !important;
        height: 0 !important;
    }
    .main .block-container,
    [data-testid="stAppViewContainer"] .block-container,
    [data-testid="stMainBlockContainer"],
    [data-testid="stAppViewBlockContainer"] {
        max-width: none !important;
        width: 100vw !important;
        height: 100vh !important;
        padding: 0 !important;
        margin: 0 !important;
    }
    [data-testid="stVerticalBlock"],
    [data-testid="stElementContainer"],
    .element-container {
        width: 100vw !important;
        height: 100vh !important;
        margin: 0 !important;
        padding: 0 !important;
        gap: 0 !important;
    }
    iframe[title="streamlit-component"] {
        width: 100vw !important;
        height: 100vh !important;
        min-height: 100vh !important;
        border: 0 !important;
        display: block !important;
    }
    </style>
    """,
    unsafe_allow_html=True,
)


try:
    start_backend()
    components.html(
        f"""
        <!doctype html>
        <html>
          <head>
            <style>
              html, body {{
                width: 100vw;
                height: 100vh;
                margin: 0;
                padding: 0;
                overflow: hidden;
                background: #0A0A0B;
              }}
              iframe {{
                position: fixed;
                inset: 0;
                width: 100vw;
                height: 100vh;
                border: 0;
                display: block;
                background: #0A0A0B;
              }}
            </style>
          </head>
          <body>
            <iframe src="{BACKEND_URL}" title="ARIA Research Console" allow="clipboard-read; clipboard-write"></iframe>
          </body>
        </html>
        """,
        height=1200,
        scrolling=False,
    )
except Exception as exc:
    st.error(str(exc))
    st.code("cd frontend\nnpm ci\nnpm run build\nstreamlit run app.py", language="powershell")
