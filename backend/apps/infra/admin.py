from django.contrib import admin

from .models import Domain, Server, SslCert, Subscription

admin.site.register([Server, Domain, SslCert, Subscription])
