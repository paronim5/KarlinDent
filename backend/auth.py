"""
Authentication module.

For now only a single hardcoded admin account exists.
In the future this will look up staff members in the database.
"""

import hashlib
import hmac
import json
import time
import secrets
import re
from functools import wraps

from flask import Blueprint, request, jsonify, current_app

auth_bp = Blueprint("auth", __name__)

# ── hardcoded admin credentials ──────────────────────────────────
# Password is stored as a SHA-256 hash so it's not plaintext in source.
ADMIN_USERNAME = "admin"
# password: "KarlinDent2026!"
ADMIN_PASSWORD_HASH = hashlib.sha256(b"KarlinDent2026!").hexdigest()

# Token lifetime: 24 hours
TOKEN_LIFETIME_S = 60 * 60 * 24


def _sanitize(value: str) -> str:
    """Strip control characters and limit length to prevent abuse."""
    if not isinstance(value, str):
        return ""
    # Remove control characters except common whitespace
    cleaned = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", value)
    return cleaned[:256]


def _make_token(username: str) -> str:
    """
    Create an HMAC-signed token encoding username + expiry.
    Format: base_hex.signature_hex
    """
    secret = current_app.config["SECRET_KEY"]
    expires = int(time.time()) + TOKEN_LIFETIME_S
    payload = json.dumps({"user": username, "exp": expires}, separators=(",", ":"))
    payload_hex = payload.encode().hex()
    sig = hmac.new(secret.encode(), payload_hex.encode(), hashlib.sha256).hexdigest()
    return f"{payload_hex}.{sig}"


def verify_token(token: str) -> dict | None:
    """
    Verify an HMAC-signed token.  Returns the payload dict or None.
    """
    if not token or "." not in token:
        return None
    try:
        payload_hex, sig = token.rsplit(".", 1)
        secret = current_app.config["SECRET_KEY"]
        expected = hmac.new(secret.encode(), payload_hex.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        payload = json.loads(bytes.fromhex(payload_hex))
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:
        return None


def login_required(f):
    """Decorator that rejects requests without a valid auth token."""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        token = ""
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
        payload = verify_token(token)
        if payload is None:
            return jsonify({"error": "unauthorized", "message": "Valid authentication required"}), 401
        request.auth_user = payload.get("user")
        return f(*args, **kwargs)
    return decorated


# ── routes ───────────────────────────────────────────────────────

@auth_bp.route("/login", methods=["POST"])
def login():
    """Authenticate with username + password, receive a signed token."""
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "bad_request", "message": "JSON body required"}), 400

    username = _sanitize(data.get("username", ""))
    password = data.get("password", "")

    if not username or not password:
        return jsonify({"error": "bad_request", "message": "Username and password required"}), 400

    # Constant-time comparison to prevent timing attacks
    password_hash = hashlib.sha256(password.encode()).hexdigest()
    username_ok = hmac.compare_digest(username, ADMIN_USERNAME)
    password_ok = hmac.compare_digest(password_hash, ADMIN_PASSWORD_HASH)

    if not (username_ok and password_ok):
        return jsonify({"error": "unauthorized", "message": "Invalid username or password"}), 401

    token = _make_token(username)
    return jsonify({
        "token": token,
        "user": {
            "id": 1,
            "first_name": "Admin",
            "last_name": "User",
            "role": "admin",
            "username": ADMIN_USERNAME,
        },
    })


@auth_bp.route("/me", methods=["GET"])
@login_required
def me():
    """Return the current authenticated user."""
    return jsonify({
        "user": {
            "id": 1,
            "first_name": "Admin",
            "last_name": "User",
            "role": "admin",
            "username": ADMIN_USERNAME,
        }
    })
