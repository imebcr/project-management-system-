"""
E-mails transactionnels, même présentation que le système filmmaking :
logo intégré à l'e-mail (pièce jointe inline, les images distantes étant souvent bloquées),
carte blanche sur fond bleu clair, bouton d'action.
"""
import logging
from email.mime.image import MIMEImage
from functools import lru_cache
from html import escape
from pathlib import Path

from django.conf import settings
from django.core.mail import EmailMultiAlternatives

log = logging.getLogger(__name__)
LOGO_CID = 'zidny-logo'
LOGO_PATH = Path(__file__).resolve().parent / 'assets' / 'email-logo.png'


@lru_cache(maxsize=1)
def _logo() -> bytes | None:
    try:
        return LOGO_PATH.read_bytes()
    except OSError:
        return None


def _layout(title: str, body_html: str, cta: tuple[str, str] | None = None) -> str:
    button = (
        f'<p style="margin:28px 0"><a href="{escape(cta[1])}" style="background:#2AA4E7;color:#fff;text-decoration:none;'
        f'font-weight:600;padding:12px 22px;border-radius:12px;display:inline-block">{escape(cta[0])}</a></p>'
        if cta else ''
    )
    logo = (
        f'<p style="margin:0 0 24px"><img src="cid:{LOGO_CID}" alt="Zidny" width="120" height="46" '
        f'style="display:block;border:0;height:46px;width:120px"></p>' if _logo() else ''
    )
    return f"""<!doctype html><html lang="fr"><body style="margin:0;background:#E9FCFF;font-family:Arial,Helvetica,sans-serif;color:#0C224B">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
{logo}
<div style="background:#fff;border-radius:16px;padding:28px">
<h1 style="font-size:18px;margin:0 0 12px">{escape(title)}</h1>
{body_html}{button}
</div>
<p style="font-size:12px;color:#0C224B88;margin-top:20px">Zidny Projets — message automatique, merci de ne pas répondre.</p>
</div></body></html>"""


def send(to: str, subject: str, text: str, html: str) -> bool:
    """Envoie un e-mail ; renvoie False en cas d'échec (l'appelant propose alors de renvoyer)."""
    message = EmailMultiAlternatives(subject, text, settings.DEFAULT_FROM_EMAIL, [to])
    message.attach_alternative(html, 'text/html')
    if f'cid:{LOGO_CID}' in html and _logo():
        message.mixed_subtype = 'related'
        image = MIMEImage(_logo(), 'png')
        image.add_header('Content-ID', f'<{LOGO_CID}>')
        image.add_header('Content-Disposition', 'inline', filename='zidny.png')
        message.attach(image)
    try:
        message.send(fail_silently=False)
        return True
    except Exception as e:  # SMTP refusé, réseau, identifiants…
        log.error('E-mail non envoyé à %s : %s', to, e)
        return False


def send_invitation(invitation, url: str) -> bool:
    labels = {'ADMIN': 'administrateur', 'DEV': 'développeur'}
    role = ' et '.join(labels[r] for r in invitation.roles) or 'membre'
    title = 'Bienvenue sur Zidny Projets'
    intro = (
        f"Bonjour {invitation.name}, {invitation.invited_by.name if invitation.invited_by_id else 'l’équipe Zidny'} "
        f"vous invite à rejoindre la plateforme de gestion de projets de l’agence Zidny en tant que {role}. "
        'Cliquez sur le bouton ci-dessous pour choisir votre mot de passe.'
    )
    validity = f'Ce lien est valable {settings.INVITE_TTL_DAYS} jours.'
    html = _layout(
        title,
        f'<p style="font-size:14px;line-height:1.6">{escape(intro)}</p>'
        f'<p style="font-size:13px;color:#0C224B99">{escape(validity)}</p>',
        ('Activer mon compte', url),
    )
    text = f'{title}\n\n{intro}\n\n{url}\n\n{validity}'
    return send(invitation.email, 'Invitation à rejoindre Zidny Projets', text, html)


def send_password_reset(user, url: str) -> bool:
    title = 'Réinitialiser votre mot de passe'
    intro = (
        f'Bonjour {user.name}, une demande de nouveau mot de passe a été faite pour votre compte Zidny Projets. '
        'Cliquez sur le bouton ci-dessous pour en choisir un. Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail : '
        'votre mot de passe actuel reste valable.'
    )
    validity = 'Ce lien est valable 1 heure et ne peut servir qu’une fois.'
    html = _layout(
        title,
        f'<p style="font-size:14px;line-height:1.6">{escape(intro)}</p>'
        f'<p style="font-size:13px;color:#0C224B99">{escape(validity)}</p>',
        ('Choisir un nouveau mot de passe', url),
    )
    text = '\n\n'.join([title, intro, url, validity])
    return send(user.email, 'Réinitialiser votre mot de passe Zidny Projets', text, html)
