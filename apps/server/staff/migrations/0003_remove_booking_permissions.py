"""The admin Bookings section is gone, so drop its permission keys from stored roles.

Only explicitly stored ``bookings.*`` keys are removed. The Super Admin role stores ``['*']`` and keeps
its full access. The reverse is a no-op: removing a permission is not data that should be recreated.
"""
from django.db import migrations


def forwards(apps, schema_editor):
    AdminRole = apps.get_model('staff', 'AdminRole')
    for role in AdminRole.objects.all():
        updates = []
        permissions = role.permissions or []
        kept = [key for key in permissions if not str(key).startswith('bookings.')]
        if kept != permissions:
            role.permissions = kept
            updates.append('permissions')
        # The seeded Order Handler used to describe bookings as part of the job.
        if role.description == 'Processes orders and bookings.':
            role.description = 'Processes orders.'
            updates.append('description')
        if updates:
            role.save(update_fields=updates)


class Migration(migrations.Migration):

    dependencies = [
        ('staff', '0002_default_roles_and_members'),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
