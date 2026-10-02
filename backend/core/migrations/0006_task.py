# Generated migration for Task model

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0005_decisionnode_node_type'),
    ]

    operations = [
        migrations.CreateModel(
            name='Task',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(help_text='Task description', max_length=255)),
                ('is_completed', models.BooleanField(default=False, help_text='Whether the task is completed')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('node', models.ForeignKey(help_text='Decision node this task belongs to', on_delete=django.db.models.deletion.CASCADE, related_name='tasks', to='core.decisionnode')),
            ],
            options={
                'ordering': ['created_at'],
            },
        ),
    ]
