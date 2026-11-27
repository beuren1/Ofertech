from io import BytesIO, StringIO
from tempfile import TemporaryDirectory
from pathlib import Path
from unittest.mock import patch

from botocore.response import StreamingBody
from botocore.stub import ANY, Stubber
from django.contrib.auth import get_user_model
from django.core.exceptions import ImproperlyConfigured
from django.core.files.storage import default_storage, storages
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command, CommandError
from django.http import HttpResponseNotFound
from django.test import RequestFactory, SimpleTestCase, override_settings
from rest_framework.test import APITestCase
from whitenoise.middleware import WhiteNoiseMiddleware

from config.media_storage import media_storage_settings
from .models import Campaign, CampaignAsset, StoreBrand
from .test_billing import PNG


S3_ENV = {
    'R2_BUCKET_NAME': 'ofertech-test',
    'R2_ENDPOINT_URL': 'https://storage.example.test',
    'R2_ACCESS_KEY_ID': 'fixture-key',
    'R2_SECRET_ACCESS_KEY': 'fixture-secret',
}
S3_SETTINGS = {
    'default': media_storage_settings(S3_ENV)[1],
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}


class MediaStorageSettingsTests(SimpleTestCase):
    def test_filesystem_is_default_and_s3_requires_all_credentials(self):
        self.assertEqual(media_storage_settings({})[0], 'filesystem')
        self.assertEqual(media_storage_settings({'R2_REGION': 'auto'})[0], 'filesystem')
        self.assertEqual(media_storage_settings(S3_ENV, on_render=True)[0], 's3')
        with self.assertRaisesMessage(ImproperlyConfigured, 'R2_BUCKET_NAME'):
            media_storage_settings({'DJANGO_MEDIA_ROOT': '/mnt/disk'}, on_render=True)
        for name in S3_ENV:
            with self.subTest(name=name), self.assertRaisesMessage(ImproperlyConfigured, name):
                media_storage_settings({**S3_ENV, name: ''})

    def test_rejects_insecure_or_embedded_bucket_endpoints(self):
        for endpoint in ('http://storage.example.test', 'https://user:secret@storage.example.test', 'https://storage.example.test/bucket'):
            with self.subTest(endpoint=endpoint), self.assertRaises(ImproperlyConfigured):
                media_storage_settings({**S3_ENV, 'R2_ENDPOINT_URL': endpoint})

    def test_static_files_are_collected_locally_and_private_media_is_not_served_by_whitenoise(self):
        config = {**S3_SETTINGS, 'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage'}}
        with TemporaryDirectory() as directory, override_settings(
            STORAGES=config, STATIC_ROOT=directory, STATIC_URL='/static/', DEBUG=False,
        ):
            call_command('collectstatic', interactive=False, verbosity=0)
            self.assertTrue((Path(directory) / 'staticfiles.json').exists())
            self.assertTrue((Path(directory) / 'admin' / 'css' / 'base.css').exists())
            middleware = WhiteNoiseMiddleware(lambda request: HttpResponseNotFound())
            factory = RequestFactory()
            static_response = middleware(factory.get('/static/admin/css/base.css'))
            self.assertEqual(static_response.status_code, 200)
            static_response.close()
            self.assertEqual(middleware(factory.get('/media/campaigns/asset.png')).status_code, 404)

    @override_settings(ON_RENDER=True, MEDIA_STORAGE_MODE='filesystem')
    def test_render_disallows_filesystem_media(self):
        with self.assertRaisesMessage(CommandError, 'Configure a mídia privada R2'):
            call_command('check_media_storage')

    @override_settings(ON_RENDER=True, MEDIA_STORAGE_MODE='s3', STORAGES=S3_SETTINGS)
    def test_render_checks_bucket_without_requiring_a_mount_or_writing(self):
        storage = storages['default']
        with Stubber(storage.connection.meta.client) as stub:
            stub.add_response('list_objects_v2', {'KeyCount': 0}, {'Bucket': storage.bucket_name, 'MaxKeys': 1})
            with patch('os.path.ismount', side_effect=AssertionError('S3 must not require a local mount')):
                call_command('check_media_storage', stdout=StringIO())
            stub.assert_no_pending_responses()
            stub.add_client_error('list_objects_v2', 'AccessDenied', http_status_code=403)
            with self.assertRaisesMessage(CommandError, 'Mídia S3 inacessível'):
                call_command('check_media_storage', stdout=StringIO())


@override_settings(MEDIA_STORAGE_MODE='s3', STORAGES=S3_SETTINGS)
class PrivateMediaApiTests(APITestCase):
    def test_admin_displays_private_media_references_without_generating_urls(self):
        user = get_user_model().objects.create_superuser(username='media-admin', password='fixture-password')
        campaign = Campaign.objects.create(owner=user, name='S3', thumbnail='campaigns/thumbnail.png')
        store = StoreBrand.objects.create(owner=user, name='Loja', logo='store-brands/logo.png')
        self.client.force_login(user)
        for model, obj, reference in (
            ('campaign', campaign, campaign.thumbnail.name), ('storebrand', store, store.logo.name),
        ):
            response = self.client.get(f'/admin/promoforge/{model}/{obj.pk}/change/')
            self.assertContains(response, reference)
            self.assertNotContains(response, f'href="{reference}"')

    def test_upload_and_download_use_s3_and_only_the_owner_can_read(self):
        user_model = get_user_model()
        owner = user_model.objects.create_user(username='s3-owner')
        other = user_model.objects.create_user(username='s3-other')
        campaign = Campaign.objects.create(owner=owner, name='S3')
        endpoint = f'/api/campaigns/{campaign.pk}/assets/'
        self.client.force_authenticate(owner)
        with TemporaryDirectory() as directory, override_settings(MEDIA_ROOT=directory):
            storage = storages['default']
            with Stubber(storage.connection.meta.client) as stub:
                lookup = {'Bucket': storage.bucket_name, 'Key': ANY}
                stub.add_client_error('head_object', '404', http_status_code=404, expected_params=lookup)
                stub.add_response('put_object', {}, {
                    **lookup, 'ContentType': 'image/png', 'CacheControl': 'private, no-store', 'Body': ANY,
                })
                created = self.client.post(endpoint, {'file': SimpleUploadedFile('produto.png', PNG, 'image/png')}, format='multipart')
                self.assertEqual(created.status_code, 201, created.data)
                artifact = CampaignAsset.objects.get(pk=created.data['id'])
                self.assertTrue(artifact.file.name.startswith(f'campaigns/{campaign.pk}/assets/'))
                self.assertNotIn('storage.example.test', str(created.data))
                stub.assert_no_pending_responses()
                with self.assertRaises(NotImplementedError):
                    default_storage.url(artifact.file.name)

                download = '/api/' + created.data['url']
                self.client.force_authenticate(None)
                self.assertEqual(self.client.get(download).status_code, 401)
                self.client.force_authenticate(other)
                self.assertEqual(self.client.get(download).status_code, 404)
                self.client.force_authenticate(owner)
                metadata = {'ContentLength': len(PNG), 'ContentType': 'image/png', 'ETag': '"test"'}
                stub.add_response('head_object', metadata, {'Bucket': storage.bucket_name, 'Key': artifact.file.name})
                stub.add_response('get_object', {**metadata, 'Body': StreamingBody(BytesIO(PNG), len(PNG))})
                response = self.client.get(download)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response['Cache-Control'], 'private, no-store')
                self.assertEqual(b''.join(response.streaming_content), PNG)
                response.close()
                stub.assert_no_pending_responses()
                stub.add_client_error('head_object', '404', http_status_code=404)
                self.assertEqual(self.client.get(download).status_code, 404)
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_only_owner_can_delete_a_campaign_and_its_s3_objects(self):
        user_model = get_user_model()
        owner = user_model.objects.create_user(username='s3-delete-owner')
        other = user_model.objects.create_user(username='s3-delete-other')
        campaign = Campaign.objects.create(owner=owner, name='Excluir', thumbnail='campaigns/thumbnail.png')
        asset = CampaignAsset.objects.create(campaign=campaign, owner=owner, file='campaigns/asset.png')
        endpoint = f'/api/campaigns/{campaign.pk}/'
        storage = storages['default']
        with Stubber(storage.connection.meta.client) as stub:
            self.client.force_authenticate(None)
            self.assertEqual(self.client.delete(endpoint).status_code, 401)
            self.client.force_authenticate(other)
            self.assertEqual(self.client.delete(endpoint).status_code, 404)
            self.assertTrue(CampaignAsset.objects.filter(pk=asset.pk).exists())
            for key in (asset.file.name, campaign.thumbnail.name):
                stub.add_response('delete_object', {}, {'Bucket': storage.bucket_name, 'Key': key})
            self.client.force_authenticate(owner)
            self.assertEqual(self.client.delete(endpoint).status_code, 204)
            self.assertFalse(CampaignAsset.objects.filter(pk=asset.pk).exists())
            stub.assert_no_pending_responses()
