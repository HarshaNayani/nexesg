from rest_framework.permissions import BasePermission

from .models import User

Role = User.Role


def has_role(*roles):
    """Build a DRF permission class that only lets the given roles through."""
    allowed = {str(r) for r in roles}

    class _HasRole(BasePermission):
        message = 'Your role does not allow this action.'

        def has_permission(self, request, view):
            user = request.user
            return bool(
                user
                and user.is_authenticated
                and user.is_active
                and user.role in allowed
            )

    _HasRole.__name__ = 'HasRole_' + '_'.join(sorted(allowed))
    return _HasRole


# Convenience groups used across views.
IsAdmin = has_role(Role.ADMIN)
CanViewData = has_role(Role.ADMIN, Role.MANAGER, Role.ANALYST, Role.AUDITOR)
CanUpload = has_role(Role.ADMIN, Role.ANALYST)
CanReview = has_role(Role.ADMIN, Role.MANAGER)
