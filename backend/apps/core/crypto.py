"""
Chiffrement d'enveloppe du coffre-fort (VLT-02) : AES-256-GCM.
Chaque entrée a sa propre clé de données (DEK), elle-même chiffrée par la clé maître (KEK)
fournie par variable d'environnement — jamais en base, jamais dans le dépôt.
"""
import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

NONCE = 12


def _key(b64: str) -> bytes:
    try:
        key = base64.b64decode(b64)
    except Exception as e:
        raise ImproperlyConfigured('VAULT_KEK doit être 32 octets encodés en base64.') from e
    if len(key) != 32:
        raise ImproperlyConfigured('VAULT_KEK doit faire 32 octets (AES-256).')
    return key


def kek() -> bytes:
    return _key(settings.VAULT_KEK)


def _seal(key: bytes, plaintext: bytes, aad: bytes = b'') -> bytes:
    nonce = os.urandom(NONCE)
    return nonce + AESGCM(key).encrypt(nonce, plaintext, aad or None)


def _open(key: bytes, sealed: bytes, aad: bytes = b'') -> bytes:
    return AESGCM(key).decrypt(sealed[:NONCE], sealed[NONCE:], aad or None)


def new_dek(master: bytes | None = None) -> tuple[bytes, bytes]:
    """Renvoie (DEK en clair, DEK chiffrée par la KEK)."""
    dek = AESGCM.generate_key(bit_length=256)
    return dek, _seal(master or kek(), dek, b'dek')


def unwrap_dek(wrapped: bytes, master: bytes | None = None) -> bytes:
    return _open(master or kek(), bytes(wrapped), b'dek')


def encrypt(dek: bytes, value: str, field: str) -> bytes:
    return _seal(dek, value.encode('utf-8'), field.encode())


def decrypt(dek: bytes, sealed: bytes | memoryview | None, field: str) -> str:
    if not sealed:
        return ''
    return _open(dek, bytes(sealed), field.encode()).decode('utf-8')


def rewrap(wrapped: bytes, old_master: bytes, new_master: bytes) -> bytes:
    """Rotation de la KEK : seule l'enveloppe change, les secrets ne sont pas rechiffrés."""
    return _seal(new_master, unwrap_dek(wrapped, old_master), b'dek')


def parse_key(b64: str) -> bytes:
    return _key(b64)
