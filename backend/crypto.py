"""Password hashing: argon2id (new) + bcrypt (legacy verify)."""
from __future__ import annotations

import argon2
import bcrypt

_ARGON2 = argon2.PasswordHasher(
    time_cost=3,        # iterations
    memory_cost=65536,  # 64 MB
    parallelism=4,
    hash_len=32,
    salt_len=16,
)

_PREFIX = "$argon2id$"


def hash_password(password: str) -> str:
    """Hash with argon2id (new standard)."""
    return _ARGON2.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Verify against argon2id OR legacy bcrypt."""
    if password_hash.startswith(_PREFIX):
        try:
            _ARGON2.verify(password_hash, password)
            return True
        except argon2.exceptions.VerifyMismatchError:
            return False
    # Legacy bcrypt
    return bcrypt.checkpw(password.encode(), password_hash.encode())
