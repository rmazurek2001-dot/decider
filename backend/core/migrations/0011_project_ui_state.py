# Generated manually for v1.29.0

from django.db import migrations, models


def default_ui_state():
    return {}


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0010_decisionnode_position_x_position_y'),
    ]

    operations = [
        migrations.AddField(
            model_name='project',
            name='ui_state',
            field=models.JSONField(blank=True, default=default_ui_state, help_text='Complete UI state: collapsedNodes, viewport, etc.'),
        ),
    ]
