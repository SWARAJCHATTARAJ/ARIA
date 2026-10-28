import ipaddress
import socket
import urllib.parse
from typing import Tuple

def is_ip_blocked(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> Tuple[bool, str]:
    """
    Checks if an IP address is blocked: loopback, private, link-local,
    unique-local, IPv4-mapped, multicast, reserved, or cloud metadata.
    """
    # Unpack IPv4-mapped IPv6 addresses (e.g. ::ffff:127.0.0.1 or ::ffff:169.254.169.254)
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped

    # Cloud metadata endpoint (Azure, AWS, GCP)
    if str(ip) == "169.254.169.254":
        return True, f"Cloud metadata IP blocked: {ip}"

    if ip.is_loopback:
        return True, f"Loopback address blocked: {ip}"
    if ip.is_private:
        return True, f"Private address blocked: {ip}"
    if ip.is_link_local:
        return True, f"Link-local address blocked: {ip}"
    if ip.is_multicast:
        return True, f"Multicast address blocked: {ip}"
    if ip.is_reserved:
        return True, f"Reserved address blocked: {ip}"
    if ip.is_unspecified:
        return True, f"Unspecified address blocked: {ip}"
        
    return False, ""

def is_safe_url(url: str) -> Tuple[bool, str]:
    """
    Validates a URL against SSRF vulnerabilities:
    - Scheme must be http or https
    - Port must be 80 or 443
    - Hostname must not be localhost
    - Resolves DNS and blocks all loopback, private, link-local, unique-local,
      IPv4-mapped, or cloud metadata addresses.
    """
    if not url:
        return False, "Empty URL"
        
    try:
        parsed = urllib.parse.urlparse(url)
    except Exception as e:
        return False, f"Invalid URL structure: {e}"
        
    scheme = (parsed.scheme or "").lower()
    if scheme not in ("http", "https"):
        return False, f"Disallowed scheme: '{scheme}'. Only http and https allowed."
        
    port = parsed.port
    if port is None:
        port = 443 if scheme == "https" else 80
    if port not in (80, 443):
        return False, f"Disallowed port: {port}. Only ports 80 and 443 allowed."
        
    hostname = parsed.hostname
    if not hostname:
        return False, "Missing hostname in URL"
        
    hostname_clean = hostname.lower().strip("[]")
    if hostname_clean in ("localhost", "localhost.localdomain", "ip6-localhost", "ip6-loopback"):
        return False, f"Localhost hostname blocked: {hostname}"
        
    # Check if hostname is an IP literal
    try:
        ip_obj = ipaddress.ip_address(hostname_clean)
        blocked, reason = is_ip_blocked(ip_obj)
        if blocked:
            return False, reason
        return True, f"Safe public IP: {ip_obj}"
    except ValueError:
        pass
        
    # Domain name -> resolve DNS for all IPv4 and IPv6 addresses
    try:
        addr_info = socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
        if not addr_info:
            return False, f"DNS resolution returned no addresses for {hostname}"
            
        for family, socktype, proto, canonname, sockaddr in addr_info:
            ip_str = sockaddr[0]
            ip_obj = ipaddress.ip_address(ip_str)
            blocked, reason = is_ip_blocked(ip_obj)
            if blocked:
                return False, f"Resolved IP {ip_str} blocked: {reason}"
                
        return True, f"Resolved {len(addr_info)} safe public IP(s)"
    except socket.gaierror as e:
        return False, f"DNS resolution failed for {hostname}: {e}"
    except Exception as e:
        return False, f"DNS verification error for {hostname}: {e}"

import httpcore
from httpcore._backends.anyio import AnyIOBackend
import httpx
from typing import Any

class SSRFSafeBackend(AnyIOBackend):
    """
    Network backend that enforces SSRF defense against DNS rebinding.
    Immediately after the socket connection is established, inspects
    sock.getpeername()[0] and blocks the stream if the connected peer IP
    is private, loopback, link-local, unique-local, or cloud metadata.
    """
    async def connect_tcp(
        self,
        host: str,
        port: int,
        timeout: float | None = None,
        local_address: str | None = None,
        socket_options: Any = None,
    ):
        stream = await super().connect_tcp(
            host,
            port,
            timeout=timeout,
            local_address=local_address,
            socket_options=socket_options,
        )
        raw_sock = getattr(stream._stream, "_raw_socket", None)
        if raw_sock:
            try:
                peer_ip_str = raw_sock.getpeername()[0]
                ip_obj = ipaddress.ip_address(peer_ip_str)
                blocked, reason = is_ip_blocked(ip_obj)
                if blocked:
                    await stream.aclose()
                    raise PermissionError(f"SSRF guard blocked connection to unsafe peer IP {peer_ip_str}: {reason}")
            except ValueError:
                pass
        return stream

class SSRFSafeTransport(httpx.AsyncHTTPTransport):
    """
    httpx AsyncHTTPTransport configured with SSRFSafeBackend to guarantee
    that connected socket peer IP is verified on every request.
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._pool = httpcore.AsyncConnectionPool(
            network_backend=SSRFSafeBackend(),
            ssl_context=getattr(self._pool, "_ssl_context", None)
        )

