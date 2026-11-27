from io import StringIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command, CommandError
from django.test import TestCase

from .models import Campaign, CampaignAsset, StoreBrand


class MediaAuditTests(TestCase):
    def test_media_audit_reports_missing_files_without_disclosing_paths_or_mutating_data(self):
        owner = get_user_model().objects.create_user(username='backup-test')
        campaign = Campaign.objects.create(owner=owner, name='Teste', thumbnail='stores/thumbnail-test.png')
        CampaignAsset.objects.create(campaign=campaign, owner=owner, file='campaigns/asset-test.png', content_type='image/png')
        StoreBrand.objects.create(owner=owner, name='Teste', logo='stores/logo-test.png')
        storage = Campaign._meta.get_field('thumbnail').storage
        report = StringIO()
        with patch.object(storage, 'exists', side_effect=lambda path: not path.endswith('asset-test.png')):
            with self.assertRaises(CommandError):
                call_command('audit_media', stdout=report)
        self.assertIn('CampaignAsset.file total=1 ausentes=1', report.getvalue())
        self.assertNotIn('asset-test.png', report.getvalue())
        self.assertEqual(CampaignAsset.objects.count(), 1)
