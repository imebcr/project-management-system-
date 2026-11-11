from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import Notification


@api_view(['POST'])
def mark_read(request, pk):
    Notification.objects.filter(pk=pk, recipient=request.user).update(read=True)
    return Response({'ok': True})


@api_view(['POST'])
def mark_all_read(request):
    Notification.objects.filter(recipient=request.user, read=False).update(read=True)
    return Response({'ok': True})
