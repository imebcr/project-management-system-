import hashlib

from celery import shared_task

from apps.core import storage


@shared_task
def compute_sha256(version_id: str):
    """DLV-02 : empreinte SHA-256 calculée côté serveur, en flux, sans charger le fichier en mémoire."""
    from .models import DeliverableVersion

    version = DeliverableVersion.objects.filter(pk=version_id).first()
    if not version:
        return None
    digest = hashlib.sha256()
    body = storage.s3().get_object(Bucket=storage.BUCKET, Key=version.key)['Body']
    for chunk in iter(lambda: body.read(1024 * 1024), b''):
        digest.update(chunk)
    version.sha256 = digest.hexdigest()
    version.save(update_fields=['sha256'])
    return version.sha256
