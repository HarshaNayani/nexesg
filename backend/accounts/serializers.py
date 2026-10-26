from rest_framework import serializers

from .models import User


class UserSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source='company.name', read_only=True, default=None)

    class Meta:
        model = User
        fields = ['id', 'email', 'first_name', 'last_name', 'picture', 'role',
                  'company', 'company_name', 'is_active', 'date_joined']
        read_only_fields = ['id', 'email', 'first_name', 'last_name', 'picture',
                            'date_joined']


class UserAdminUpdateSerializer(serializers.ModelSerializer):
    """What an Admin is allowed to change on another user."""

    class Meta:
        model = User
        fields = ['role', 'company', 'is_active']

    def validate(self, attrs):
        role = attrs.get('role', getattr(self.instance, 'role', None))
        company = attrs.get('company', getattr(self.instance, 'company', None))
        # Everyone except Admin and Pending must belong to a company, otherwise
        # they could never see any data.
        if role in (User.Role.ANALYST, User.Role.MANAGER, User.Role.AUDITOR) and company is None:
            raise serializers.ValidationError(
                {'company': 'Analyst, Manager and Auditor must be assigned to a company.'}
            )
        return attrs


class GoogleLoginSerializer(serializers.Serializer):
    id_token = serializers.CharField()
