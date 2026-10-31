from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """
    Custom user. Google proves identity only; the role and company live here,
    so permissions are always decided by our own database.
    """

    class Role(models.TextChoices):
        PENDING = 'PENDING', 'Pending approval'
        ANALYST = 'ANALYST', 'Analyst'
        MANAGER = 'MANAGER', 'Manager'
        AUDITOR = 'AUDITOR', 'Auditor'
        ADMIN = 'ADMIN', 'Admin'
        # Self-service visitors: own private sandbox company with sample data.
        DEMO = 'DEMO', 'Demo'

    email = models.EmailField(unique=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.PENDING)
    # Admins may have no company (they see every company). Everyone else is
    # scoped to this company.
    company = models.ForeignKey(
        'api.Company',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='users',
    )
    picture = models.URLField(blank=True)

    def __str__(self):
        return f"{self.email} ({self.role})"
