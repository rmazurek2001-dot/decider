# Generated migration for adding position fields to DecisionNode

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0009_decisionnode_actual_cost'),
    ]

    operations = [
        migrations.AddField(
            model_name='decisionnode',
            name='position_x',
            field=models.FloatField(default=0.0, help_text='X coordinate for node position in ReactFlow canvas'),
        ),
        migrations.AddField(
            model_name='decisionnode',
            name='position_y',
            field=models.FloatField(default=0.0, help_text='Y coordinate for node position in ReactFlow canvas'),
        ),
    ]
