"""Probe: check if Directory write/security scopes are authorized in domain-wide delegation.

Run: railway run python scripts/probe_google_write_scopes.py
Only performs token exchanges — no writes. Never prints key material.
"""
import base64
import json
import os
import sys
import time
import urllib.parse
import urllib.request

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

SCOPES = [
    "https://www.googleapis.com/auth/admin.directory.user",
    "https://www.googleapis.com/auth/admin.directory.user.security",
    "https://www.googleapis.com/auth/admin.directory.group.readonly",
    "https://www.googleapis.com/auth/apps.licensing",
    "https://www.googleapis.com/auth/admin.reports.audit.readonly",
    "https://www.googleapis.com/auth/admin.reports.usage.readonly",
    "https://www.googleapis.com/auth/admin.datatransfer",
]


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def main():
    raw = os.environ.get("GOOGLE_SERVICE_ACCOUNT_KEY_B64")
    key = json.loads(base64.b64decode(raw)) if raw else json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_KEY"])
    pem = key["private_key"].replace("\\n", "\n") if "\\n" in key["private_key"] else key["private_key"]
    private_key = serialization.load_pem_private_key(pem.encode(), password=None)
    admin_email = os.environ.get("GOOGLE_ADMIN_EMAIL", "van-tac@taylor-corp.net")

    ok = True
    for scope in SCOPES:
        now = int(time.time())
        header = b64url(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
        claims = b64url(json.dumps({
            "iss": key["client_email"], "sub": admin_email, "scope": scope,
            "aud": "https://oauth2.googleapis.com/token", "iat": now, "exp": now + 3600,
        }).encode())
        signing_input = f"{header}.{claims}".encode()
        signature = b64url(private_key.sign(signing_input, padding.PKCS1v15(), hashes.SHA256()))
        body = urllib.parse.urlencode({
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
            "assertion": f"{signing_input.decode()}.{signature}",
        }).encode()
        req = urllib.request.Request("https://oauth2.googleapis.com/token", data=body, method="POST")
        short = scope.rsplit("/", 1)[-1]
        try:
            with urllib.request.urlopen(req, timeout=20):
                print(f"{short}: AUTHORIZED")
        except urllib.error.HTTPError as e:
            print(f"{short}: NOT AUTHORIZED ({e.read().decode()[:120]})")
            ok = False

    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
