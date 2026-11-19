import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from config import Settings

def test_cors():
    print("=== TESTING CORS CONFIGURATION ===")
    s_prod = Settings(environment="production", allowed_origins="https://aria.swarajchattaraj.tech")
    prod_origins = s_prod.get_allowed_origins_list()
    print(f"Production origins ({s_prod.environment}): {prod_origins}")
    assert "https://aria.swarajchattaraj.tech" in prod_origins
    assert "https://localhost" in prod_origins
    assert "capacitor://localhost" in prod_origins
    assert "tauri://localhost" in prod_origins

    s_dev = Settings(environment="development", allowed_origins="https://aria.swarajchattaraj.tech")
    dev_origins = s_dev.get_allowed_origins_list()
    print(f"Development origins ({s_dev.environment}): {dev_origins}")
    assert "https://aria.swarajchattaraj.tech" in dev_origins
    assert "http://localhost:5173" in dev_origins
    assert "http://127.0.0.1:5173" in dev_origins
    assert "https://localhost" in dev_origins

    print("\n>>> PASS: CORS correctly includes native Capacitor, Tauri, and web origins.")
    return True

if __name__ == "__main__":
    success = test_cors()
    sys.exit(0 if success else 1)
