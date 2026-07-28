import os
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

import boto3
from botocore.config import Config
from dotenv import load_dotenv

load_dotenv()

R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
R2_BUCKET = os.getenv("R2_BUCKET")
R2_PUBLIC_URL = os.getenv("R2_PUBLIC_URL")

if not R2_PUBLIC_URL and R2_ACCOUNT_ID:
    R2_PUBLIC_URL = f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
if not all([R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL]):
    print("Missing R2 configuration in .env", file=sys.stderr)
    sys.exit(1)

s3 = boto3.client(
    "s3",
    endpoint_url=R2_PUBLIC_URL,
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    region_name="auto",
    config=Config(signature_version="s3v4"),
)

THUMB_DIR = Path("/home/akshat/projects/muzix/backend/assets/thumbnails")
THUMB_DIR.mkdir(parents=True, exist_ok=True)

VIDEO_IDS = """g4tHn1Ng_iM
OeqV6oyNHc0
rsEne1ZiQrk
U2TPS-9oMtc
qPRNIHxLhmc
R0rKB_bsUNg
wKDU5pXhf5o
y08R20KflNM
ricvj03PHSU
OlStmta0Vh4
JcVDXHeD59c
AWZF4Em0cwU
oH1eiyQpw2E
17c7kDMG_mU
jh0v2SAIW5o
xBa3YUgQeL4
rhVqSATlmQs
hpNBXbJ7rzs
b-esdxjN8N8
_GA3dj_HxO4
kMXs99tPkcg
86kEbw4pvxU
UKunvvN2iCk
3_g2un5M350
jBhbgZYz7pI
a40tAP5MC6M
BCvmAySCnLk
2QcSvOSXTBc
3Ox2AWEFhjQ
DWi73D1vZTc
Jt5nPuMgKA8
a1PkVEHV-w8
atGlHRi0n4A
RPCqZssID78
tX2ncrjdZ3o
1ExndLNGnmY
sfvFAqzIGh8
mTLQhPFx2nM
1mOGF169Eno
EjlLdjzE7dg
xNKOrBA9Sp0
ZpVFxl3WV3U
YY2ng9SjCTo
GfiJowcJiVw
polycpBREYA
UmLB8Smjcyk
GliLQ3CnTK8
8CWy_-afIpY
pkAAIGFNYw4
x0bRHmTQEsE
QAAOynFujNw""".strip().splitlines()

URL_TEMPLATES = [
    "https://img.youtube.com/vi/{vid}/maxresdefault.jpg",
    "https://img.youtube.com/vi/{vid}/hqdefault.jpg",
]

def download_thumbnail(vid: str) -> bytes | None:
    for url_tpl in URL_TEMPLATES:
        url = url_tpl.format(vid=vid)
        try:
            with urllib.request.urlopen(url, timeout=15) as resp:
                data = resp.read()
            if len(data) >= 1000:
                return data
        except (urllib.error.HTTPError, urllib.error.URLError, OSError):
            continue
    return None

def already_on_r2(vid: str) -> bool:
    key = f"thumbnails/{vid}.jpg"
    try:
        s3.head_object(Bucket=R2_BUCKET, Key=key)
        return True
    except Exception:
        return False

def upload_to_r2(vid: str, data: bytes):
    key = f"thumbnails/{vid}.jpg"
    s3.put_object(Bucket=R2_BUCKET, Key=key, Body=data, ContentType="image/jpeg")

success = 0

for vid in VIDEO_IDS:
    local_path = THUMB_DIR / f"{vid}.jpg"
    local_ok = local_path.exists() and local_path.stat().st_size > 1000
    r2_ok = already_on_r2(vid) if not local_ok else False

    if local_ok and r2_ok:
        print(f"✓ thumbnails/{vid}.jpg (cached)")
        success += 1
        continue

    if local_ok:
        data = local_path.read_bytes()
    else:
        data = download_thumbnail(vid)
        if data is None:
            print(f"✗ {vid}")
            continue
        local_path.write_bytes(data)

    if r2_ok:
        print(f"✓ thumbnails/{vid}.jpg (local only)")
        success += 1
        continue

    upload_to_r2(vid, data)
    print(f"✓ thumbnails/{vid}.jpg")
    success += 1
    time.sleep(0.1)

print(f"\nUploaded {success}/{len(VIDEO_IDS)} thumbnails")
