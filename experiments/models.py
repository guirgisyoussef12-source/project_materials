from django.db import models


class Material(models.Model):
    """A material we test (Aluminum, Steel, ...). Added from the admin page."""

    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        """Name shown in the admin page."""
        return self.name


class Experiment(models.Model):
    """One test run, with its raw readings."""

    SOURCE_CHOICES = [
        ("simulation", "Simulation"),
        ("hardware", "Hardware (Arduino)"),
    ]

    # Null = "Unknown material" (the one we want the system to predict).
    material = models.ForeignKey(
        Material, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="experiments",
    )
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default="simulation")
    created_at = models.DateTimeField(auto_now_add=True)
    duration = models.FloatField(help_text="Seconds")
    sample_rate = models.PositiveIntegerField(help_text="Hz")
    # List of [time_seconds, value] pairs.
    readings = models.JSONField(default=list)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]

    @property
    def code(self):
        """Short ID like VT-007, built from the database id."""
        return f"VT-{self.pk:03d}"

    def __str__(self):
        """Text shown in the admin page."""
        return f"{self.code} - {self.material or 'Unknown'}"


class Result(models.Model):
    """Numbers calculated from one experiment. Empty (null) if they could not be calculated."""

    experiment = models.OneToOneField(
        Experiment, on_delete=models.CASCADE, related_name="result"
    )
    peak_amplitude = models.FloatField()
    decay_rate = models.FloatField(null=True, blank=True)
    damping_ratio = models.FloatField(null=True, blank=True)
    frequency = models.FloatField(null=True, blank=True)
    settling_time = models.FloatField(null=True, blank=True)
    predicted_material = models.ForeignKey(
        Material, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="+",
    )
    confidence = models.FloatField(null=True, blank=True, help_text="0-100")

    def __str__(self):
        """Text shown in the admin page."""
        return f"Result for {self.experiment}"