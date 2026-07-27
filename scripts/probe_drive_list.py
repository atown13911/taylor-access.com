"""Probe: exchange a drive.readonly token and attempt a files.list to see the exact error.

Run: railway run python scripts/probe_drive_list.py
Read-only. Never prints key material.
"""
import base64
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.asymmetric import padding

SCOPE = "https://www.googleapis.com/auth/drive.readonly"
SUBJECT = os.environ.get("GOOGLE_ADMIN_EMAIL", "van-tac@taylor-corp.net")


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def main():
    raw = os.environ.get("GOOGLE_SERVICE_ACCOUNT_KEY_B64")
    key = json.loads(base64.b64decode(raw)) if raw else json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_KEY"])
    pem = key["private_key"].replace("\\n", "\n") if "\\n" in key["private_key"] else key["private_key"]
    private_key = serialization.load_pem_private_key(pem.encode(), password=None)

    now = int(time.time())
    header = b64url(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
    claims = b64url(json.dumps({
        "iss": key["client_email"],
        "sub": SUBJECT,
        "scope": SCOPE,
        "aud": "https://oauth2.googleapis.com/token",
        "iat": now,
        "exp": now + 3600,
    }).encode())
    signing_input = f"{header}.{claims}".encode()
    signature = b64url(private_key.sign(signing_input, padding.PKCS1v15(), hashes.SHA256()))
    assertion = f"{header}.{claims}.{signature}"

    data = urllib.parse.urlencode({
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
        "assertion": assertion,
    }).encode()
    req = urllib.request.Request("https://oauth2.googleapis.com/token", data=data)
    with urllib.request.urlopen(req) as res:
        token = json.load(res)["access_token"]
    print("token OK")

    url = ("https://www.googleapis.com/drive/v3/files?pageSize=5&q="
           + urllib.parse.quote("'me' in owners and trashed=false")
           + "&fields=" + urllib.parse.quote("files(id,name,mimeType)"))
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req) as res:
            body = json.load(res)
        print("files.list OK:", len(body.get("files", [])), "files")
        for f in body.get("files", []):
            print(" -", f.get("name"), f.get("mimeType"))
    except urllib.error.HTTPError as e:
        print("files.list FAILED", e.code)
        print(e.read().decode()[:800])


if __name__ == "__main__":
    main()
