from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
from pathlib import Path
from shutil import which

import streamlit as st
import streamlit.components.v1 as components


ROOT = Path(__file__).resolve().parent
BACKEND_HOST = "127.0.0.1"
BACKEND_PORT = 8000


def secret_backend_url() -> str:
    try:
        return str(st.secrets.get("ARIA_BACKEND_URL", "")).strip()
    except Exception:
        return ""


def configured_backend_url() -> str:
    return (
        st.session_state.get("backend_url", "").strip()
        or os.getenv("ARIA_BACKEND_URL", "").strip()
        or secret_backend_url()
        or f"http://{BACKEND_HOST}:{BACKEND_PORT}"
    )


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


def npm_command() -> str | None:
    return which("npm.cmd") or which("npm")


def run_command(command: list[str], cwd: Path) -> None:
    completed = subprocess.run(
        command,
        cwd=str(cwd),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        shell=False,
    )
    if completed.returncode != 0:
        output = completed.stdout.strip() or "No command output."
        raise RuntimeError(f"`{' '.join(command)}` failed:\n{output}")


def ensure_frontend_build() -> None:
    frontend_dir = ROOT / "frontend"
    dist_index = frontend_dir / "dist" / "index.html"
    if dist_index.exists():
        return

    npm = npm_command()
    if not npm:
        raise FileNotFoundError(
            "frontend/dist/index.html was not found and npm is not available. "
            "Install Node.js, then run `npm ci` and `npm run build` inside the frontend folder."
        )

    if not (frontend_dir / "node_modules").exists():
        run_command([npm, "ci"], frontend_dir)
    run_command([npm, "run", "build"], frontend_dir)


@st.cache_resource
def start_backend() -> subprocess.Popen | None:
    backend_url = configured_backend_url()
    if backend_url != f"http://{BACKEND_HOST}:{BACKEND_PORT}":
        return None

    if port_is_open(BACKEND_HOST, BACKEND_PORT):
        return None

    ensure_frontend_build()

    python = ROOT / ".venv" / "Scripts" / "python.exe"
    if not python.exists():
        python = Path(sys.executable)

    process = subprocess.Popen(
        [
            str(python),
            "-m",
            "uvicorn",
            "main:app",
            "--host",
            BACKEND_HOST,
            "--port",
            str(BACKEND_PORT),
        ],
        cwd=str(ROOT),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
    )

    for _ in range(120):
        if port_is_open(BACKEND_HOST, BACKEND_PORT):
            return process
        if process.poll() is not None:
            output = process.stdout.read().strip() if process.stdout else ""
            detail = f"\n\nBackend output:\n{output}" if output else ""
            raise RuntimeError(f"FastAPI backend exited before opening port {BACKEND_PORT}.{detail}")
        time.sleep(0.25)

    process.terminate()
    output = process.stdout.read().strip() if process.stdout else ""
    detail = f"\n\nBackend output:\n{output}" if output else ""
    raise RuntimeError(f"FastAPI backend did not start on port {BACKEND_PORT}.{detail}")


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
    backend_url = configured_backend_url()
    page_host = (st.context.headers.get("host", "") if hasattr(st, "context") else "")
    is_public_page = page_host and page_host.split(":")[0] not in {"localhost", "127.0.0.1", "::1"}
    is_local_backend = backend_url.startswith("http://127.0.0.1") or backend_url.startswith("http://localhost") or backend_url.startswith("http://[::1]")

    if is_public_page and is_local_backend:
        st.title("ARIA Research Console")
        st.error(
            "This page is public, but the backend URL still points to localhost. "
            "Set `ARIA_BACKEND_URL` to a publicly reachable FastAPI URL or enter it below."
        )
        if "backend_url" not in st.session_state:
            st.session_state.backend_url = ""
        st.session_state.backend_url = st.text_input(
            "FastAPI backend URL",
            value=st.session_state.backend_url,
            placeholder="https://your-fastapi-host.example.com",
        ).strip()
        if st.session_state.backend_url:
            st.rerun()
    else:
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
                    color: #EAECEF;
                    font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
                  }}
                  iframe {{
                    width: 100vw;
                    height: 100vh;
                    border: 0;
                    display: block;
                    background: #0A0A0B;
                  }}
                </style>
              </head>
              <body>
                <iframe src="{backend_url}" title="ARIA Research Console" allow="clipboard-read; clipboard-write"></iframe>
              </body>
            </html>
            """,
            height=1200,
            scrolling=False,
        )
except Exception as exc:
    st.error(str(exc))
    st.code(
        "cd C:\\Users\\Hp\\OneDrive\\Desktop\\project\n"
        "cd frontend\n"
        "npm ci\n"
        "npm run build\n"
        "cd ..\n"
        "# For Streamlit Cloud or any public deployment, set ARIA_BACKEND_URL\n"
        "# to the deployed FastAPI URL before running Streamlit.\n"
        "streamlit run app.py",
        language="powershell",
    )
