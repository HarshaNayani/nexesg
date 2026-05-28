from django.contrib import admin
from .models import Company, EmissionRecord

admin.site.register(Company)
admin.site.register(EmissionRecord)