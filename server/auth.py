"""JWT verification for the SIGMA image server.

SIGMA serves complete DICOM studies (see api/wado.py) and raw pixel data
(api/volumes.py). Until now every router was unauthenticated and CORS was
open to "*", so anyone who could reach port 8060 could pull whole studies
with all PHI headers intact, and nothing recorded who did.

Callers present the scoped handoff token minted by the ewocs5 backend at
POST /api/sigma/handoff. It is signed HS256 with the shared JWT_SECRET,
carries typ="sigma-handoff", and is bound to one task and one volume.

HS256 is HMAC-SHA256, so this is stdlib only — no PyJWT dependency.
"""

import base64
import hashlib
import hmac
import json
import os
import time

from fastapi import Header, HTTPException

JWT_SECRET = os.getenv("JWT_SECRET", "")
HANDOFF_TYP = "sigma-handoff"

# Escape hatch for local viewer development against non-PHI fixtures. It must
# never be set where real patient data is reachable; main.py logs loudly if it is.
AUTH_DISABLED = os.getenv("SIGMA_AUTH_DISABLED", "").lower() in ("1", "true", "yes")


def _b64url_decode(segment: str) -> bytes:
    padding = "=" * (-len(segment) % 4)
    return base64.urlsafe_b64decode(segment + padding)


def verify_token(token: str) -> dict:
    """Return the decoded claims, or raise ValueError.

    Rejects anything that is not HS256 — in particular alg="none" and an
    RS256 header that would otherwise let a public key be used as an HMAC key.
    """
    if not JWT_SECRET:
        raise ValueError("JWT_SECRET is not configured on the SIGMA server")

    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("malformed token")
    header_b64, payload_b64, signature_b64 = parts

    try:
        header = json.loads(_b64url_decode(header_b64))
    except Exception:
        raise ValueError("malformed token header")

    if header.get("alg") != "HS256":
        raise ValueError("unsupported algorithm: %r" % header.get("alg"))

    expected = hmac.new(
        JWT_SECRET.encode("utf-8"),
        f"{header_b64}.{payload_b64}".encode("ascii"),
        hashlib.sha256,
    ).digest()

    if not hmac.compare_digest(expected, _b64url_decode(signature_b64)):
        raise ValueError("bad signature")

    try:
        claims = json.loads(_b64url_decode(payload_b64))
    except Exception:
        raise ValueError("malformed token payload")

    exp = claims.get("exp")
    if exp is None:
        raise ValueError("token has no expiry")
    if time.time() >= float(exp):
        raise ValueError("token expired")

    if claims.get("typ") != HANDOFF_TYP:
        raise ValueError("not a SIGMA handoff token")

    return claims


async def require_token(authorization: str = Header(default="")) -> dict:
    """FastAPI dependency. Applied to every PHI-serving router in main.py."""
    if AUTH_DISABLED:
        return {"userId": "auth-disabled", "username": "auth-disabled"}

    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        return verify_token(authorization[len("Bearer "):].strip())
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))


if __name__ == "__main__":
    # Self-check: python3 server/auth.py
    import sys

    globals()["JWT_SECRET"] = "testsecret"

    def make(claims, secret="testsecret", alg="HS256"):
        h = base64.urlsafe_b64encode(json.dumps({"alg": alg, "typ": "JWT"}).encode()).rstrip(b"=").decode()
        p = base64.urlsafe_b64encode(json.dumps(claims).encode()).rstrip(b"=").decode()
        sig = hmac.new(secret.encode(), f"{h}.{p}".encode(), hashlib.sha256).digest()
        return f"{h}.{p}." + base64.urlsafe_b64encode(sig).rstrip(b"=").decode()

    future = time.time() + 3600
    ok = make({"typ": HANDOFF_TYP, "taskId": "t1", "exp": future})
    assert verify_token(ok)["taskId"] == "t1", "valid token"

    def rejects(tok, why):
        try:
            verify_token(tok)
        except ValueError:
            return
        sys.exit("FAILED to reject: " + why)

    rejects(make({"typ": HANDOFF_TYP, "taskId": "t1", "exp": time.time() - 1}), "expired")
    rejects(make({"typ": HANDOFF_TYP, "taskId": "t1"}), "no expiry")
    rejects(make({"typ": HANDOFF_TYP, "taskId": "t1", "exp": future}, secret="wrong"), "wrong key")
    rejects(make({"typ": "session", "taskId": "t1", "exp": future}), "wrong typ (session token replay)")
    rejects(make({"typ": HANDOFF_TYP, "exp": future}, alg="none"), "alg=none")
    rejects("not.a.token", "malformed")
    rejects("onlyonepart", "malformed")

    # Signature must be checked over the exact header+payload, not a re-encode.
    tampered = ok.split(".")
    tampered[1] = base64.urlsafe_b64encode(
        json.dumps({"typ": HANDOFF_TYP, "taskId": "ATTACKER", "exp": future}).encode()
    ).rstrip(b"=").decode()
    rejects(".".join(tampered), "tampered payload")

    print("auth.py self-check passed (9 assertions)")
