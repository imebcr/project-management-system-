"""
Accès direct au stockage S3 : URLs présignées (téléchargement, dépôt simple ou multipart).
Même code pour SeaweedFS en local, Cloudflare R2 ou Supabase Storage en production.
"""
from functools import lru_cache
from urllib.parse import quote

import boto3
from botocore.config import Config
from django.conf import settings


@lru_cache(maxsize=1)
def s3():
    return boto3.client(
        's3',
        endpoint_url=settings.AWS_S3_ENDPOINT_URL,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.AWS_S3_REGION_NAME,
        config=Config(signature_version='s3v4', s3={'addressing_style': settings.AWS_S3_ADDRESSING_STYLE}),
    )


BUCKET = settings.AWS_STORAGE_BUCKET_NAME


def ensure_bucket():
    client = s3()
    try:
        client.head_bucket(Bucket=BUCKET)
    except Exception:
        client.create_bucket(Bucket=BUCKET)


def content_disposition(filename: str, inline: bool = False) -> str:
    ascii_name = filename.encode('ascii', 'ignore').decode() or 'fichier'
    kind = 'inline' if inline else 'attachment'
    return f'{kind}; filename="{ascii_name.replace(chr(34), "")}"; filename*=UTF-8\'\'{quote(filename)}'


def presigned_get(key: str, filename: str | None = None, expires: int = 3600, inline: bool = False) -> str:
    params = {'Bucket': BUCKET, 'Key': key}
    if filename:
        params['ResponseContentDisposition'] = content_disposition(filename, inline)
    return s3().generate_presigned_url('get_object', Params=params, ExpiresIn=expires)


def presigned_put(key: str, content_type: str, expires: int = 3600) -> str:
    return s3().generate_presigned_url('put_object', Params={'Bucket': BUCKET, 'Key': key, 'ContentType': content_type}, ExpiresIn=expires)


def file_url(field, filename: str | None = None, inline: bool = True) -> str | None:
    """URL temporaire d'un FileField (photos de retours, cahiers des charges)."""
    if not field:
        return None
    return presigned_get(field.name, filename, inline=inline)


# ---------- Multipart (DLV-03 : reprise après coupure) ----------

def multipart_create(key: str, content_type: str) -> str:
    return s3().create_multipart_upload(Bucket=BUCKET, Key=key, ContentType=content_type)['UploadId']


def multipart_part_url(key: str, upload_id: str, part_number: int, expires: int = 3600) -> str:
    return s3().generate_presigned_url(
        'upload_part', Params={'Bucket': BUCKET, 'Key': key, 'UploadId': upload_id, 'PartNumber': part_number}, ExpiresIn=expires,
    )


def multipart_parts(key: str, upload_id: str) -> list[dict]:
    """Parties déjà reçues par le stockage : sert à reprendre un dépôt et à le finaliser sans dépendre du navigateur."""
    parts, marker = [], 0
    while True:
        r = s3().list_parts(Bucket=BUCKET, Key=key, UploadId=upload_id, PartNumberMarker=marker)
        parts += [{'PartNumber': p['PartNumber'], 'ETag': p['ETag'], 'Size': p['Size']} for p in r.get('Parts', [])]
        if not r.get('IsTruncated'):
            return parts
        marker = r['NextPartNumberMarker']


def multipart_complete(key: str, upload_id: str):
    parts = multipart_parts(key, upload_id)
    s3().complete_multipart_upload(
        Bucket=BUCKET, Key=key, UploadId=upload_id,
        MultipartUpload={'Parts': [{'PartNumber': p['PartNumber'], 'ETag': p['ETag']} for p in parts]},
    )


def multipart_abort(key: str, upload_id: str):
    s3().abort_multipart_upload(Bucket=BUCKET, Key=key, UploadId=upload_id)


def head(key: str) -> dict | None:
    try:
        return s3().head_object(Bucket=BUCKET, Key=key)
    except Exception:
        return None


def delete(key: str):
    s3().delete_object(Bucket=BUCKET, Key=key)
