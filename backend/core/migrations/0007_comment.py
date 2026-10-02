# Generated migration for Comment model

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0006_task'),
    ]

    operations = [
        migrations.CreateModel(
            name='Comment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('author_name', models.CharField(help_text='Name/signature of the comment author', max_length=100)),
                ('content', models.TextField(help_text='Comment content')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('node', models.ForeignKey(help_text='Decision node this comment belongs to', on_delete=django.db.models.deletion.CASCADE, related_name='comments', to='core.decisionnode')),
            ],
            options={
                'ordering': ['created_at'],
            },
        ),
    ]
