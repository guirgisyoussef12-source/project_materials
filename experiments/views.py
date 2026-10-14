import json

from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_http_methods

from .models import Experiment, Material, Result


def _num(value):
    """Return a float, or None for missing / NaN / non-numeric values."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number else None


def serialize_experiment(exp):
    result = getattr(exp, "result", None)
    return {
        "id": exp.code,
        "material": exp.material.name if exp.material else "Unknown",
        "source": exp.source,
        "duration": exp.duration,
        "peak": result.peak_amplitude if result else None,
        "decay": result.decay_rate if result else None,
        "result": (
            result.predicted_material.name
            if result and result.predicted_material else "Unavailable"
        ),
        "created_at": exp.created_at.isoformat(),
    }


@ensure_csrf_cookie
def dashboard(request):
    return render(request, "experiments/dashboard.html", {
        "materials": Material.objects.all(),
    })


@require_http_methods(["GET", "POST"])
def experiments_api(request):
    if request.method == "GET":
        qs = (Experiment.objects
              .select_related("material", "result__predicted_material")[:50])
        return JsonResponse({
            "total": Experiment.objects.count(),
            "experiments": [serialize_experiment(e) for e in qs],
        })

    try:
        data = json.loads(request.body)
        duration = float(data["duration"])
        sample_rate = int(data["sample_rate"])
        readings = data["readings"]
        if not isinstance(readings, list) or not readings:
            raise ValueError("readings must be a non-empty list")
    except (ValueError, KeyError, TypeError) as exc:
        return JsonResponse({"error": f"Invalid payload: {exc}"}, status=400)

    material = None
    if data.get("material"):
        material = Material.objects.filter(name=data["material"]).first()

    source = data.get("source", "simulation")
    if source not in dict(Experiment.SOURCE_CHOICES):
        source = "simulation"

    metrics = data.get("metrics") or {}
    predicted = None
    if data.get("predicted_material"):
        predicted = Material.objects.filter(name=data["predicted_material"]).first()

    exp = Experiment.objects.create(
        material=material, source=source, duration=duration,
        sample_rate=sample_rate, readings=readings,
    )
    Result.objects.create(
        experiment=exp,
        peak_amplitude=_num(metrics.get("peak")) or 0.0,
        decay_rate=_num(metrics.get("decay_rate")),
        damping_ratio=_num(metrics.get("damping_ratio")),
        frequency=_num(metrics.get("frequency")),
        settling_time=_num(metrics.get("settling_time")),
        predicted_material=predicted,
        confidence=_num(data.get("confidence")),
    )
    exp.refresh_from_db()
    return JsonResponse(serialize_experiment(exp), status=201)