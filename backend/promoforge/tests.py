from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import resolve, reverse
from django.utils import timezone
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken
from django.test import RequestFactory, override_settings
from tempfile import TemporaryDirectory
from rest_framework.test import APITestCase

from .models import Campaign, CampaignAsset, Promotion, StoreBrand

User = get_user_model()


class PromoForgeApiTests(APITestCase):
    def test_django_admin_token_form_excludes_the_raw_refresh_token(self):
        owner = User.objects.create_superuser(username='fixture-admin')
        token = OutstandingToken.objects.create(
            user=owner, jti='fixture-token-jti', token='fixture-raw-refresh-token',
            expires_at=timezone.now(),
        )
        path = reverse('admin:token_blacklist_outstandingtoken_change', args=[token.pk])
        request = RequestFactory().get(path)
        request.user = owner
        match = resolve(path)
        request.resolver_match = match
        response = match.func(request, **match.kwargs).render()
        self.assertEqual(response.status_code, 200)
        form = response.context_data['adminform']
        self.assertIn('jti', form.fieldsets[0][1]['fields'])
        self.assertNotIn('token', form.fieldsets[0][1]['fields'])
        self.assertContains(response, 'fixture-token-jti')
        self.assertNotContains(response, 'fixture-raw-refresh-token')

    def test_registration_persists_user_with_hashed_password_and_profile(self):
        response = self.client.post('/api/auth/register/', {
            'name': 'Demo Promo',
            'email': 'demo@example.com',
            'password': 'senha-segura-123',
        }, format='json')
        self.assertEqual(response.status_code, 201)
        user = User.objects.get(email='demo@example.com')
        self.assertEqual(user.username, 'demo@example.com')
        self.assertEqual(user.get_full_name(), 'Demo Promo')
        self.assertTrue(user.check_password('senha-segura-123'))
        self.assertNotEqual(user.password, 'senha-segura-123')
        self.assertTrue(user.profile)
        self.assertEqual(user.subscription.plan_id, 'free')
        self.assertEqual(user.subscription.credits, 10)
        self.assertIn('access', response.data)
        self.assertNotIn('refresh', response.data)
        self.assertTrue(response.cookies['promoforge_refresh']['httponly'])

    def test_registration_rejects_duplicate_email_and_weak_password(self):
        User.objects.create_user(
            username='demo@example.com',
            email='demo@example.com',
            password='senha-segura-123',
        )
        duplicate = self.client.post('/api/auth/register/', {
            'name': 'Outra Conta',
            'email': 'DEMO@example.com',
            'password': 'senha-segura-123',
        }, format='json')
        weak_password = self.client.post('/api/auth/register/', {
            'name': 'Nova Conta',
            'email': 'nova@example.com',
            'password': '123',
        }, format='json')

        self.assertEqual(duplicate.status_code, 400)
        self.assertIn('email', duplicate.data)
        self.assertEqual(weak_password.status_code, 400)
        self.assertIn('password', weak_password.data)

    def test_login_returns_access_token_and_httponly_refresh_cookie(self):
        User.objects.create_user(
            username='demo@example.com',
            email='demo@example.com',
            password='senha-segura-123',
            first_name='Demo',
        )

        response = self.client.post('/api/auth/login/', {
            'username': 'demo@example.com',
            'password': 'senha-segura-123',
        }, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertIn('access', response.data)
        self.assertNotIn('refresh', response.data)
        self.assertTrue(response.cookies['promoforge_refresh']['httponly'])
        self.assertEqual(response.cookies['promoforge_refresh']['samesite'], 'Lax')

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        me_response = self.client.get('/api/auth/me/')
        self.assertEqual(me_response.status_code, 200)
        self.assertEqual(me_response.data['name'], 'Demo')

    def test_refresh_and_logout_revoke_refresh_cookie(self):
        User.objects.create_user(
            username='demo@example.com',
            email='demo@example.com',
            password='senha-segura-123',
        )
        login = self.client.post('/api/auth/login/', {
            'username': 'demo@example.com',
            'password': 'senha-segura-123',
        }, format='json')
        refresh_token = login.cookies['promoforge_refresh'].value

        refresh = self.client.post('/api/auth/refresh/', {}, format='json')
        self.assertEqual(refresh.status_code, 200)
        self.assertIn('access', refresh.data)
        self.assertNotIn('refresh', refresh.data)

        logout = self.client.post('/api/auth/logout/', {}, format='json')
        self.assertEqual(logout.status_code, 205)
        self.assertEqual(logout.cookies['promoforge_refresh'].value, '')

        self.client.cookies['promoforge_refresh'] = refresh_token
        revoked_refresh = self.client.post('/api/auth/refresh/', {}, format='json')
        self.assertEqual(revoked_refresh.status_code, 401)

    def test_me_requires_authentication(self):
        response = self.client.get('/api/auth/me/')
        self.assertIn(response.status_code, (401, 403))

    def test_deactivated_account_cannot_use_existing_access_or_refresh_tokens(self):
        user = User.objects.create_user(username='disabled@example.test', password='senha-segura-123')
        login = self.client.post('/api/auth/login/', {
            'username': user.username, 'password': 'senha-segura-123',
        }, format='json')
        self.assertEqual(login.status_code, 200)
        user.is_active = False
        user.save(update_fields=['is_active'])
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
        self.assertEqual(self.client.get('/api/auth/me/').status_code, 401)
        self.client.credentials()
        self.assertEqual(self.client.post('/api/auth/refresh/', {}, format='json').status_code, 401)

    def test_login_rejects_invalid_password(self):
        User.objects.create_user(
            username='demo@example.com',
            email='demo@example.com',
            password='senha-segura-123',
        )
        response = self.client.post('/api/auth/login/', {
            'username': 'demo@example.com',
            'password': 'senha-incorreta',
        }, format='json')
        self.assertEqual(response.status_code, 401)
        self.assertNotIn('promoforge_refresh', response.cookies)

    def test_local_frontend_origin_can_send_credentialed_api_requests(self):
        response = self.client.options(
            '/api/auth/register/',
            HTTP_ORIGIN='http://localhost:5173',
            HTTP_ACCESS_CONTROL_REQUEST_METHOD='POST',
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS='content-type',
        )
        self.assertEqual(
            response.headers['Access-Control-Allow-Origin'],
            'http://localhost:5173',
        )
        self.assertEqual(response.headers['Access-Control-Allow-Credentials'], 'true')

    def test_promotion_crud_requires_authentication(self):
        response = self.client.get('/api/promotions/')
        self.assertIn(response.status_code, (401, 403))

    def test_user_can_create_promotion(self):
        user = User.objects.create_user(username='owner', password='senha-segura-123')
        self.client.force_authenticate(user)
        response = self.client.post('/api/promotions/', {
            'title': 'Liquida Verão',
            'channel': 'Instagram',
            'status': 'draft',
            'configuration': {'color': '#5b45e6'},
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['title'], 'Liquida Verão')

    def test_user_can_create_bulk_promotions_and_invalid_batch_is_rejected(self):
        from .test_billing import paid_fixture

        user = User.objects.create_user(username='batch-owner', password='senha-segura-123')
        paid_fixture(user)
        self.client.force_authenticate(user)

        response = self.client.post('/api/promotions/bulk/', {
            'promotions': [
                {
                    'title': 'Produto Um',
                    'channel': 'Instagram',
                    'status': 'ready',
                    'configuration': {
                        'batch_id': 'test-batch',
                        'image_filename': '01-produto-um.png',
                    },
                },
                {
                    'title': 'Produto Dois',
                    'channel': 'Instagram',
                    'status': 'ready',
                    'configuration': {
                        'batch_id': 'test-batch',
                        'image_filename': '02-produto-dois.png',
                    },
                },
            ],
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['created'], 2)
        self.assertEqual(user.promotions.count(), 2)

        restored = self.client.get('/api/promotions/bulk/?batch_id=test-batch')
        self.assertEqual(restored.status_code, 200)
        self.assertEqual(restored.data['created'], 2)

        updated = self.client.patch('/api/promotions/bulk/', {
            'promotions': [{
                'id': response.data['promotions'][0]['id'],
                'title': 'Produto Um Editado',
                'configuration': {
                    'batch_id': 'test-batch',
                    'editor': {'backgroundColor': '#112233'},
                },
            }],
        }, format='json')
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(
            user.promotions.get(title='Produto Um Editado').configuration['editor']['backgroundColor'],
            '#112233',
        )

        other_user = User.objects.create_user(username='other-owner', password='senha-segura-123')
        paid_fixture(other_user)
        self.client.force_authenticate(other_user)
        cross_user_edit = self.client.patch('/api/promotions/bulk/', {
            'promotions': [{
                'id': response.data['promotions'][1]['id'],
                'title': 'Edição não autorizada',
                'configuration': {'batch_id': 'test-batch'},
            }],
        }, format='json')
        self.assertEqual(cross_user_edit.status_code, 400)
        self.assertFalse(user.promotions.filter(title='Edição não autorizada').exists())

        invalid = self.client.post('/api/promotions/bulk/', {'promotions': []}, format='json')
        self.assertEqual(invalid.status_code, 400)

    def test_campaign_create_retrieve_update_delete_and_owner_isolation(self):
        owner = User.objects.create_user(username='campaign-owner', password='senha-segura-123')
        other_user = User.objects.create_user(username='campaign-other', password='senha-segura-123')
        self.client.force_authenticate(owner)
        created = self.client.post('/api/campaigns/', {
            'name': 'Liquidação de verão',
            'batch_id': 'campaign-batch',
            'artworks': [{
                'index': 0,
                'product': {'name': 'Jaqueta', 'price': 'R$ 99'},
                'config': {'backgroundColor': '#112233'},
            }],
        }, format='json')
        self.assertEqual(created.status_code, 201)
        campaign_id = created.data['id']

        retrieved = self.client.get(f'/api/campaigns/{campaign_id}/')
        self.assertEqual(retrieved.status_code, 200)
        self.assertEqual(retrieved.data['artworks'][0]['config']['backgroundColor'], '#112233')

        updated = self.client.patch(f'/api/campaigns/{campaign_id}/', {
            'name': 'Liquidação de inverno',
            'artworks': [{
                'index': 0,
                'product': {'name': 'Jaqueta', 'price': 'R$ 79'},
                'config': {'backgroundColor': '#334455'},
            }],
        }, format='json')
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.data['name'], 'Liquidação de inverno')
        self.assertEqual(updated.data['artworks'][0]['product']['price'], 'R$ 79')

        self.client.force_authenticate(other_user)
        self.assertEqual(self.client.get(f'/api/campaigns/{campaign_id}/').status_code, 404)
        self.assertEqual(self.client.patch(f'/api/campaigns/{campaign_id}/', {'name': 'Acesso indevido'}, format='json').status_code, 404)
        self.assertEqual(self.client.delete(f'/api/campaigns/{campaign_id}/').status_code, 404)

        self.client.force_authenticate(owner)
        self.assertEqual(self.client.delete(f'/api/campaigns/{campaign_id}/').status_code, 204)
        self.assertFalse(Campaign.objects.filter(id=campaign_id).exists())

    def test_store_brands_are_editable_and_isolated_between_users(self):
        owner = User.objects.create_user(username='store-owner', password='senha-segura-123')
        other_user = User.objects.create_user(username='store-other', password='senha-segura-123')
        self.client.force_authenticate(owner)
        created = self.client.post('/api/stores/', {
            'name': 'Mercado Central',
            'primary_color': '#123ABC',
            'secondary_color': '#fedcba',
            'instagram': '@mercadocentral',
            'whatsapp': '+5511999999999',
            'website': 'https://mercado.example',
            'slogan': 'Preço bom todo dia',
        }, format='json')
        self.assertEqual(created.status_code, 201)
        store_id = created.data['id']
        self.assertEqual(created.data['primary_color'], '#123abc')
        self.assertEqual(created.data['slogan'], 'Preço bom todo dia')
        store_list = self.client.get('/api/stores/')
        self.assertEqual(len(store_list.data['results']), 1)

        updated = self.client.patch(f'/api/stores/{store_id}/', {
            'name': 'Mercado Central Atualizado',
            'secondary_color': '#aabbcc',
        }, format='json')
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.data['name'], 'Mercado Central Atualizado')

        invalid_color = self.client.patch(f'/api/stores/{store_id}/', {
            'primary_color': 'vermelho',
        }, format='json')
        self.assertEqual(invalid_color.status_code, 400)

        self.client.force_authenticate(other_user)
        self.assertEqual(self.client.get(f'/api/stores/{store_id}/').status_code, 404)
        self.assertEqual(self.client.patch(
            f'/api/stores/{store_id}/',
            {'name': 'Acesso indevido'},
            format='json',
        ).status_code, 404)

    def test_campaign_keeps_owned_store_and_brand_snapshot(self):
        owner = User.objects.create_user(username='brand-campaign-owner', password='senha-segura-123')
        other_user = User.objects.create_user(username='brand-campaign-other', password='senha-segura-123')
        store = StoreBrand.objects.create(
            owner=owner,
            name='Loja da campanha',
            primary_color='#123abc',
            secondary_color='#fedcba',
            slogan='Oferta todos os dias',
        )
        foreign_store = StoreBrand.objects.create(owner=other_user, name='Loja de outra conta')
        self.client.force_authenticate(owner)
        created = self.client.post('/api/campaigns/', {
            'name': 'Campanha com identidade',
            'store_brand': store.id,
            'brand_snapshot': {
                'name': store.name,
                'primary_color': store.primary_color,
                'secondary_color': store.secondary_color,
                'slogan': store.slogan,
            },
            'artworks': [],
        }, format='json')
        self.assertEqual(created.status_code, 201)
        campaign_id = created.data['id']
        self.assertEqual(created.data['store_brand'], store.id)
        self.assertEqual(created.data['brand_snapshot']['slogan'], store.slogan)
        self.assertEqual(Campaign.objects.get(id=campaign_id).store_brand, store)

        rejected = self.client.post('/api/campaigns/', {
            'name': 'Campanha de outra loja',
            'store_brand': foreign_store.id,
            'artworks': [],
        }, format='json')
        self.assertEqual(rejected.status_code, 400)

    def test_store_logo_upload_persists_validates_and_stays_private(self):
        with TemporaryDirectory() as media_root, override_settings(MEDIA_ROOT=media_root):
            owner = User.objects.create_user(username='logo-owner', password='senha-segura-123')
            other_user = User.objects.create_user(username='logo-other', password='senha-segura-123')
            self.client.force_authenticate(owner)
            store = self.client.post('/api/stores/', {
                'name': 'Loja da Logo',
            }, format='json')
            store_id = store.data['id']
            valid_png = SimpleUploadedFile(
                'logo.png',
                b'\x89PNG\r\n\x1a\nconteudo de imagem',
                content_type='image/png',
            )
            uploaded = self.client.post(
                f'/api/stores/{store_id}/logo-upload/',
                {'file': valid_png},
                format='multipart',
            )
            self.assertEqual(uploaded.status_code, 200)
            self.assertEqual(uploaded.data['logo_url'], f'stores/{store_id}/logo/content/')
            store_model = StoreBrand.objects.get(id=store_id)
            self.assertTrue(store_model.logo.storage.exists(store_model.logo.name))

            content_response = self.client.get(f'/api/stores/{store_id}/logo/content/')
            content = b''.join(content_response.streaming_content)
            self.assertEqual(content, b'\x89PNG\r\n\x1a\nconteudo de imagem')
            self.assertEqual(content_response['X-Content-Type-Options'], 'nosniff')

            invalid_signature = self.client.post(
                f'/api/stores/{store_id}/logo-upload/',
                {'file': SimpleUploadedFile(
                    'fake.png',
                    b'not-a-png',
                    content_type='image/png',
                )},
                format='multipart',
            )
            self.assertEqual(invalid_signature.status_code, 400)
            oversized = self.client.post(
                f'/api/stores/{store_id}/logo-upload/',
                {'file': SimpleUploadedFile(
                    'large.png',
                    b'\x89PNG\r\n\x1a\n' + b'x' * (10 * 1024 * 1024),
                    content_type='image/png',
                )},
                format='multipart',
            )
            self.assertEqual(oversized.status_code, 400)

            self.client.force_authenticate(other_user)
            self.assertEqual(
                self.client.get(f'/api/stores/{store_id}/logo/content/').status_code,
                404,
            )
            self.assertEqual(
                self.client.post(
                    f'/api/stores/{store_id}/logo-upload/',
                    {'file': SimpleUploadedFile(
                        'other.png',
                        b'\x89PNG\r\n\x1a\nvalid',
                        content_type='image/png',
                    )},
                    format='multipart',
                ).status_code,
                404,
            )

    def test_campaign_assets_are_private_persistent_and_removed_with_campaign(self):
        with TemporaryDirectory() as media_root, override_settings(MEDIA_ROOT=media_root):
            owner = User.objects.create_user(username='asset-owner', password='senha-segura-123')
            other_user = User.objects.create_user(username='asset-other', password='senha-segura-123')
            self.client.force_authenticate(owner)
            campaign = self.client.post('/api/campaigns/', {
                'name': 'Campanha com foto',
                'artworks': [],
            }, format='json')
            campaign_id = campaign.data['id']
            invalid_upload = self.client.post(
                f'/api/campaigns/{campaign_id}/assets/',
                {'file': SimpleUploadedFile('falso.png', b'not an image', content_type='image/png')},
                format='multipart',
            )
            self.assertEqual(invalid_upload.status_code, 400)
            upload = SimpleUploadedFile(
                'fone.png',
                b'\x89PNG\r\n\x1a\nconteudo de teste',
                content_type='image/png',
            )
            response = self.client.post(
                f'/api/campaigns/{campaign_id}/assets/',
                {'file': upload},
                format='multipart',
            )
            self.assertEqual(response.status_code, 201)
            asset_id = response.data['id']
            asset = CampaignAsset.objects.get(id=asset_id)
            self.assertTrue(asset.file.storage.exists(asset.file.name))

            updated = self.client.patch(f'/api/campaigns/{campaign_id}/', {
                'artworks': [{
                    'index': 0,
                    'product': {'name': 'Fone', 'image_asset_id': asset_id},
                    'config': {},
                }],
            }, format='json')
            self.assertEqual(updated.status_code, 200)

            content_path = f'/api/campaigns/{campaign_id}/assets/{asset_id}/content/'
            content_response = self.client.get(content_path)
            content = b''.join(content_response.streaming_content)
            self.assertEqual(content, b'\x89PNG\r\n\x1a\nconteudo de teste')
            self.client.force_authenticate(other_user)
            self.assertEqual(self.client.get(content_path).status_code, 404)

            self.client.force_authenticate(owner)
            self.client.delete(f'/api/campaigns/{campaign_id}/')
            self.assertFalse(asset.file.storage.exists(asset.file.name))

    def test_campaign_duplicate_copies_assets_and_campaign_delete_removes_promotions(self):
        with TemporaryDirectory() as media_root, override_settings(MEDIA_ROOT=media_root):
            owner = User.objects.create_user(username='duplicate-owner', password='senha-segura-123')
            self.client.force_authenticate(owner)
            store = StoreBrand.objects.create(owner=owner, name='Loja da campanha')
            created = self.client.post('/api/campaigns/', {
                'name': 'Campanha original',
                'batch_id': 'original-batch',
                'store_brand': store.id,
                'artworks': [],
            }, format='json')
            campaign_id = created.data['id']
            uploaded = self.client.post(
                f'/api/campaigns/{campaign_id}/assets/',
                {'file': SimpleUploadedFile('produto.jpg', b'\xff\xd8\xffjpeg-test\xff\xd9', content_type='image/jpeg')},
                format='multipart',
            )
            asset_id = uploaded.data['id']
            self.client.patch(f'/api/campaigns/{campaign_id}/', {
                'artworks': [{
                    'index': 0,
                    'promotion_id': 0,
                    'product': {'name': 'Produto', 'image_asset_id': asset_id},
                    'config': {'brand': {'logo_asset_id': asset_id}},
                }],
                'brand_snapshot': {
                    'name': 'Loja da Campanha',
                    'primary_color': '#123abc',
                    'secondary_color': '#fedcba',
                    'logo_asset_id': asset_id,
                },
            }, format='json')
            promotion = Promotion.objects.create(
                owner=owner,
                campaign_id=campaign_id,
                title='Produto',
                configuration={'batch_id': 'original-batch', 'image_asset_id': asset_id},
            )
            self.client.patch(f'/api/campaigns/{campaign_id}/', {
                'artworks': [{
                    'index': 0,
                    'promotion_id': promotion.id,
                    'product': {'name': 'Produto', 'image_asset_id': asset_id},
                    'config': {'brand': {'logo_asset_id': asset_id}},
                }],
            }, format='json')

            duplicate = self.client.post(f'/api/campaigns/{campaign_id}/duplicate/')
            self.assertEqual(duplicate.status_code, 201)
            duplicate_id = duplicate.data['id']
            cloned = Campaign.objects.get(id=duplicate_id)
            self.assertEqual(cloned.name, 'Campanha original (cópia)')
            self.assertNotEqual(cloned.batch_id, 'original-batch')
            self.assertEqual(cloned.store_brand_id, store.id)
            cloned_asset_id = cloned.artworks[0]['product']['image_asset_id']
            self.assertNotEqual(cloned_asset_id, asset_id)
            self.assertTrue(cloned.assets.filter(id=cloned_asset_id).exists())
            self.assertEqual(cloned.brand_snapshot['logo_asset_id'], cloned_asset_id)
            self.assertEqual(
                cloned.artworks[0]['config']['brand']['logo_asset_id'],
                cloned_asset_id,
            )
            self.assertEqual(cloned.promotions.count(), 1)

            self.client.delete(f'/api/campaigns/{campaign_id}/')
            self.assertFalse(Promotion.objects.filter(id=promotion.id).exists())
            self.assertTrue(Campaign.objects.filter(id=duplicate_id).exists())
