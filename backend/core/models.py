import uuid

from django.core.validators import MinValueValidator
from django.db import models


class Project(models.Model):
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    budget_total = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(0)]
    )
    share_token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    
    ui_state = models.JSONField(
        default=dict,
        blank=True,
        help_text="Complete UI state: collapsedNodes, viewport, etc."
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title


class DecisionNode(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('selected', 'Selected'),
        ('rejected', 'Rejected'),
    ]
    
    SECTION_CHOICES = [
        ('general', 'General'),
        ('transport', 'Transport'),
        ('accommodation', 'Accommodation'),
        ('food', 'Food & Drinks'),
        ('entertainment', 'Entertainment'),
        ('activities', 'Activities'),
        ('services', 'Services'),
        ('equipment', 'Equipment'),
        ('other', 'Other'),
    ]
    
    NODE_TYPE_CHOICES = [
        ('decision', 'Decision'),
        ('milestone', 'Milestone'),
    ]
    
    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name='decision_nodes'
    )
    parent = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='children'
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    estimated_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        default=0
    )
    actual_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        null=True,
        blank=True,
        help_text="Actual cost incurred (filled manually during execution)"
    )
    
    node_type = models.CharField(
        max_length=20,
        choices=NODE_TYPE_CHOICES,
        default='decision',
        help_text="Type of node: decision (with ratings) or milestone (organizational)"
    )
    
    section = models.CharField(
        max_length=50,
        choices=SECTION_CHOICES,
        default='general',
        help_text="Category/section of this decision"
    )
    
    order = models.IntegerField(
        default=0,
        help_text="Chronological order (0 = first, higher = later)"
    )
    
    score_comfort = models.IntegerField(
        default=50,
        validators=[MinValueValidator(0)],
        help_text="Comfort level (0-100)"
    )
    score_risk = models.IntegerField(
        default=50,
        validators=[MinValueValidator(0)],
        help_text="Risk level (0-100, higher = more risky)"
    )
    score_time = models.IntegerField(
        default=50,
        validators=[MinValueValidator(0)],
        help_text="Time efficiency (0-100, higher = faster)"
    )
    score_pleasure = models.IntegerField(
        default=50,
        validators=[MinValueValidator(0)],
        help_text="Pleasure/satisfaction level (0-100)"
    )
    
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending',
        help_text="Current status of this decision node"
    )
    
    position_x = models.FloatField(
        default=0.0,
        help_text="X coordinate for node position in ReactFlow canvas"
    )
    position_y = models.FloatField(
        default=0.0,
        help_text="Y coordinate for node position in ReactFlow canvas"
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order', 'created_at']

    def __str__(self):
        return f"{self.project.title} - {self.title}"


class Vote(models.Model):
    node = models.ForeignKey(
        DecisionNode,
        on_delete=models.CASCADE,
        related_name='votes'
    )
    session_id = models.CharField(max_length=255, blank=True, null=True)
    ip_address = models.GenericIPAddressField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = [['node', 'session_id']]

    def __str__(self):
        return f"Vote for {self.node.title}"


class ChatMessage(models.Model):
    ROLE_CHOICES = [
        ('user', 'User'),
        ('assistant', 'Assistant'),
        ('system', 'System'),
    ]
    
    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name='chat_messages'
    )
    role = models.CharField(
        max_length=20,
        choices=ROLE_CHOICES,
        help_text="Message sender role"
    )
    content = models.TextField(
        help_text="Message content"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"{self.project.title} - {self.role}: {self.content[:50]}"


class Task(models.Model):
    """
    Task model - konkretne zadania do wykonania dla wybranej decyzji
    """
    node = models.ForeignKey(
        DecisionNode,
        on_delete=models.CASCADE,
        related_name='tasks',
        help_text="Decision node this task belongs to"
    )
    title = models.CharField(
        max_length=255,
        help_text="Task description"
    )
    is_completed = models.BooleanField(
        default=False,
        help_text="Whether the task is completed"
    )
    due_date = models.DateField(
        null=True,
        blank=True,
        help_text="Due date for this task"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        status = "✓" if self.is_completed else "○"
        return f"{status} {self.title}"


class Comment(models.Model):
    """
    Comment model - komentarze do węzłów decyzyjnych (dyskusja zespołowa)
    """
    node = models.ForeignKey(
        DecisionNode,
        on_delete=models.CASCADE,
        related_name='comments',
        help_text="Decision node this comment belongs to"
    )
    author_name = models.CharField(
        max_length=100,
        help_text="Name/signature of the comment author"
    )
    content = models.TextField(
        help_text="Comment content"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"{self.author_name}: {self.content[:50]}"


