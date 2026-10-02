import core.models
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0011_project_ui_state'),
    ]

    operations = [
        migrations.AddField(
            model_name='project',
            name='criteria_weights',
            field=models.JSONField(blank=True, default=core.models.default_criteria_weights, help_text='Criteria weights (comfort, risk, time, pleasure), each 0-5'),
        ),
        migrations.AlterField(
            model_name='project',
            name='ui_state',
            field=models.JSONField(blank=True, default=dict, help_text='Complete UI state: collapsedNodes, viewport, etc.'),
        ),
        migrations.CreateModel(
            name='LLMCall',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('operation', models.CharField(max_length=64)),
                ('model', models.CharField(max_length=100)),
                ('latency_ms', models.PositiveIntegerField(default=0)),
                ('input_tokens', models.PositiveIntegerField(default=0)),
                ('output_tokens', models.PositiveIntegerField(default=0)),
                ('cost_usd', models.FloatField(default=0.0)),
                ('attempts', models.PositiveSmallIntegerField(default=1)),
                ('success', models.BooleanField(default=True)),
                ('error', models.TextField(blank=True)),
                ('project', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='llm_calls', to='core.project')),
            ],
            options={
                'ordering': ['-created_at'],
                'indexes': [models.Index(fields=['created_at'], name='core_llmcal_created_1754e9_idx'), models.Index(fields=['operation'], name='core_llmcal_operati_ad0fd6_idx')],
            },
        ),
    ]
