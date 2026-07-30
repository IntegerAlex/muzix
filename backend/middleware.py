"""Security middleware: CORS + security headers as raw ASGI."""
from __future__ import annotations

from fastapi import Request, Response
from starlette.types import ASGIApp, Receive, Scope, Send

from config import CORS_ORIGIN_SET

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "0",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; font-src 'self' data:",
}


def _origin_allowed(origin: str | None) -> bool:
    return bool(origin and origin in CORS_ORIGIN_SET)


class SecurityMiddleware:
    """Combined CORS + security headers middleware as raw ASGI."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope, receive)
        origin = request.headers.get("origin")

        if request.method == "OPTIONS":
            if not _origin_allowed(origin):
                response = Response(status_code=403, content="Origin not allowed")
                await response(scope, receive, send)
                return
            response = Response(status_code=204)
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
            response.headers["Access-Control-Max-Age"] = "600"
            await response(scope, receive, send)
            return

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                try:
                    raw_headers: list[tuple[bytes, bytes]] = list(message.get("headers", []))
                    raw_headers = [(k, v) for k, v in raw_headers if k != b"server"]
                    for k, v in SECURITY_HEADERS.items():
                        raw_headers.append((k.lower().encode(), v.encode()))
                    if _origin_allowed(origin):
                        raw_headers.append((b"access-control-allow-origin", origin.encode()))
                        raw_headers.append((b"access-control-allow-credentials", b"true"))
                        vary = b""
                        for k, v in raw_headers:
                            if k == b"vary":
                                vary = v
                                break
                        if b"Origin" not in vary.split(b", "):
                            new_vary = (vary + b", Origin").strip(b", ") if vary else b"Origin"
                            raw_headers = [(k, v) for k, v in raw_headers if k != b"vary"]
                            raw_headers.append((b"vary", new_vary))
                    message["headers"] = raw_headers
                except Exception:
                    pass
            await send(message)

        await self.app(scope, receive, send_wrapper)
