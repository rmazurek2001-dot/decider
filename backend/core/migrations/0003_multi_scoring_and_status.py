# Generated migration for multi-scoring and status fields

from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0002_project_share_token_vote'),
    ]

    operations = [
        migrations.AddField(
            model_name='decisionnode',
            name='score_comfort',
            field=models.IntegerField(default=50, help_text='Comfort level (0-100)', validators=[django.core.validators.MinValueValidator(0)]),
        ),
        migrations.AddField(
            model_name='decisionnode',
            name='score_risk',
            field=models.IntegerField(default=50, help_text='Risk level (0-100, higher = more risky)', validators=[django.core.validators.MinValueValidator(0)]),
        ),
        migrations.AddField(
            model_name='decisionnode',
            name='score_time',
            field=models.IntegerField(default=50, help_text='Time efficiency (0-100, higher = faster)', validators=[django.core.validators.MinValueValidator(0)]),
        ),
        migrations.AddField(
            model_name='decisionnode',
            name='score_pleasure',
            field=models.IntegerField(default=50, help_text='Pleasure/satisfaction level (0-100)', validators=[django.core.validators.MinValueValidator(0)]),
        ),
        migrations.AddField(
            model_name='decisionnode',
            name='status',
            field=models.CharField(choices=[('pending', 'Pending'), ('selected', 'Selected'), ('rejected', 'Rejected')], default='pending', help_text='Current status of this decision node', max_length=20),
        ),
    ]
