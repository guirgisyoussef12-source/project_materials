from django.test import TestCase

from .models import Experiment, Material, Result


class ModelTests(TestCase):
    def test_experiment_with_result(self):
        steel = Material.objects.create(name="Steel")
        exp = Experiment.objects.create(
            material=steel, duration=10, sample_rate=100,
            readings=[[0.0, 4.0], [0.01, 3.9]],
        )
        Result.objects.create(experiment=exp, peak_amplitude=4.0, decay_rate=0.12)
        self.assertEqual(exp.result.decay_rate, 0.12)
        self.assertEqual(steel.experiments.count(), 1)

    def test_unknown_material_allowed(self):
        exp = Experiment.objects.create(duration=5, sample_rate=50)
        self.assertIsNone(exp.material)