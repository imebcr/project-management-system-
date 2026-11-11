"""Un rôle unique → une liste de rôles cumulables (ex. Admin + Dev). Les données existantes sont conservées."""
import django.contrib.postgres.fields
from django.db import migrations, models

import apps.accounts.models


def copy_role(apps, schema_editor):
    for name in ('User', 'Invitation'):
        Model = apps.get_model('accounts', name)
        for obj in Model.objects.all():
            obj.roles = [obj.role or 'DEV']
            obj.save(update_fields=['roles'])


def copy_back(apps, schema_editor):
    for name in ('User', 'Invitation'):
        Model = apps.get_model('accounts', name)
        for obj in Model.objects.all():
            obj.role = 'ADMIN' if 'ADMIN' in (obj.roles or []) else 'DEV'
            obj.save(update_fields=['role'])


def roles_field():
    return django.contrib.postgres.fields.ArrayField(
        base_field=models.CharField(choices=[('ADMIN', 'Admin'), ('DEV', 'Dev')], max_length=10),
        default=apps.accounts.models.default_roles, size=None,
    )


class Migration(migrations.Migration):
    dependencies = [('accounts', '0003_alter_invitation_department_alter_user_department')]

    operations = [
        migrations.AddField('user', 'roles', roles_field()),
        migrations.AddField('invitation', 'roles', roles_field()),
        migrations.RunPython(copy_role, copy_back),
        migrations.RemoveField('user', 'role'),
        migrations.RemoveField('invitation', 'role'),
    ]
