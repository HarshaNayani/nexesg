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


class EmailOTP(models.Model):
    """
    One-time sign-in code sent by email. Only a keyed hash of the code is
    stored, so a database leak does not reveal usable codes.
    """

    email = models.EmailField(db_index=True)
    code_hash = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    used = models.BooleanField(default=False)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"OTP for {self.email} at {self.created_at:%Y-%m-%d %H:%M}"
