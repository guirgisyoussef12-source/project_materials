from django.urls import path
from . import views

app_name = "experiments"

urlpatterns = [
    path("", views.dashboard, name="dashboard"),
    path("api/experiments/", views.experiments_api, name="experiments_api"),
]