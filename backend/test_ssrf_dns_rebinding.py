import asyncio
import socket
import sys
import os
from unittest.mock import patch
import ipaddress

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from utils.ssrf_guard import is_safe_url, is_ip_blocked, SSRFSafeBackend, SSRFSafeTransport

async def test_dns_rebinding():
    print("=" * 80)
    print("TEST E.2: SSRF DNS REBINDING DEFENSE VERIFICATION")
    print("Requirement: Connect to the validated IP, or re-validate the peer IP after")
    print("connecting. Test with a hostname that resolves to a public IP and then to a private IP.")
    print("=" * 80)

    hostname = "rebind.attacker.org"
    url = f"http://{hostname}/internal/secret"

    # 1. Phase 1: Pre-connection URL / DNS check
    # In a classic DNS rebinding attack, the initial DNS lookup returns a public IP
    with patch("socket.getaddrinfo") as mock_getaddrinfo:
        mock_getaddrinfo.return_value = [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 80))
        ]
        is_safe, reason = is_safe_url(url)
        print(f"\n[Phase 1: Initial DNS Resolution (SSRF Pre-check)]")
        print(f" URL: {url}")
        print(f" Hostname: {hostname}")
        print(f" Initial DNS resolved to: 93.184.216.34 (Public IP)")
        print(f" Pre-check Verdict: is_safe={is_safe} ({reason})")
        assert is_safe, "Initial public resolution must pass URL check!"

    # 2. Phase 2: Connection Time Rebinding to Private IP (127.0.0.1)
    # The attacker's DNS switches resolution to 127.0.0.1.
    # We spin up a local TCP listener to verify the socket connects, then SSRFSafeBackend
    # inspects raw_sock.getpeername()[0] and terminates the connection.
    server = await asyncio.start_server(lambda r, w: w.close(), "127.0.0.1", 0)
    local_port = server.sockets[0].getsockname()[1]

    try:
        print(f"\n[Phase 2: Post-Connect Socket Inspection (DNS Rebinding to 127.0.0.1:{local_port})]")
        print(" Attacker switches DNS to point to 127.0.0.1.")
        print(" ARIA connects with SSRFSafeBackend (verifying sock.getpeername()[0] after connect)...")

        backend = SSRFSafeBackend()
        try:
            await backend.connect_tcp("127.0.0.1", local_port)
            print(" ERROR: Socket connection unexpectedly allowed!")
            assert False, "Should have been blocked by SSRFSafeBackend!"
        except PermissionError as e:
            print(f" [PASS] Connection blocked immediately after connect:")
            print(f" -> {e}")
            assert "SSRF guard blocked" in str(e) and "127.0.0.1" in str(e)
    finally:
        server.close()
        await server.wait_closed()

    # 3. Phase 3: Cloud Metadata (169.254.169.254) Rebinding Check
    print(f"\n[Phase 3: Re-validation against Cloud Metadata (169.254.169.254)]")
    meta_ip = ipaddress.ip_address("169.254.169.254")
    blocked, reason = is_ip_blocked(meta_ip)
    print(f" Cloud metadata IP: {meta_ip} -> blocked={blocked} ({reason})")
    assert blocked and "Cloud metadata" in reason

    # 4. Phase 4: Other Private / Link-Local Ranges
    print(f"\n[Phase 4: Blocked Ranges Summary]")
    for test_ip in ["10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "::1"]:
        b, r = is_ip_blocked(ipaddress.ip_address(test_ip))
        print(f" IP: {test_ip:18} -> blocked={b} ({r})")
        assert b

    print("\n" + "=" * 80)
    print("ALL SSRF DNS REBINDING DEFENSE CHECKS PASSED")
    print("=" * 80)

if __name__ == "__main__":
    asyncio.run(test_dns_rebinding())
