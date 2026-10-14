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


class ApiTests(TestCase):
    def setUp(self):
        self.steel = Material.objects.create(name="Steel")
        self.payload = {
            "material": "Steel",
            "source": "simulation",
            "duration": 10,
            "sample_rate": 100,
            "readings": [[0.0, 4.0], [0.01, 3.9], [0.02, 3.7]],
            "metrics": {"peak": 4.0, "decay_rate": 0.12,
                        "damping_ratio": 0.004, "settling_time": 33.3},
            "predicted_material": "Steel",
            "confidence": 91,
        }

    def post(self, payload):
        import json
        return self.client.post("/api/experiments/", json.dumps(payload),
                                content_type="application/json")

    def test_dashboard_lists_materials_from_db(self):
        response = self.client.get("/")
        self.assertContains(response, 'value="Steel"')

    def test_save_experiment(self):
        response = self.post(self.payload)
        self.assertEqual(response.status_code, 201)
        exp = Experiment.objects.get()
        self.assertEqual(exp.material, self.steel)
        self.assertEqual(exp.result.decay_rate, 0.12)
        self.assertEqual(exp.result.predicted_material, self.steel)

    def test_save_unknown_material_and_nan_metrics(self):
        self.payload["material"] = None
        self.payload["metrics"] = {"peak": 1.0, "decay_rate": None}
        response = self.post(self.payload)
        self.assertEqual(response.status_code, 201)
        self.assertIsNone(Experiment.objects.get().material)

    def test_invalid_payload_rejected(self):
        response = self.post({"duration": 5})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Experiment.objects.count(), 0)

    def test_list_history(self):
        self.post(self.payload)
        data = self.client.get("/api/experiments/").json()
        self.assertEqual(data["total"], 1)
        self.assertEqual(data["experiments"][0]["material"], "Steel")