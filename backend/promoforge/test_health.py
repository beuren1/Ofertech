from unittest.mock import patch

from django.db import OperationalError
from django.test import TestCase


class HealthCheckTests(TestCase):
    def test_public_response_is_minimal_and_not_cacheable(self):
        response = self.client.get('/api/health/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'status': 'ok'})
        self.assertIn('no-store', response['Cache-Control'])
        self.assertEqual(self.client.post('/api/health/').status_code, 405)

    def test_database_failure_does_not_expose_details(self):
        with patch('config.health.connection.cursor', side_effect=OperationalError('private connection details')):
            response = self.client.get('/api/health/')
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {'status': 'unavailable'})
