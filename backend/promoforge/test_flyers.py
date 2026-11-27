from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from .test_billing import paid_fixture


class FlyerProjectTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.owner = user_model.objects.create_user(username='flyer-owner')
        self.other = user_model.objects.create_user(username='other-flyer-owner')
        paid_fixture(self.owner)
        paid_fixture(self.other)
        self.payload = {
            'name': 'Encarte da semana',
            'design': {
                'title': 'Ofertas', 'subtitle': 'Até domingo', 'template': 'grocery',
                'layout': 9, 'arrangement': 'wide', 'font': 'sans', 'grouped': True,
                'primary': '#123456', 'accent': '#654321', 'background': '#FFFFFF',
                'logo': '', 'backgroundImage': '',
            },
            'products': [{
                'name': 'Café', 'category': 'Mercearia', 'price': '18,90',
                'originalPrice': '20,90', 'discount': '', 'imageUrl': '',
            }],
        }

    def test_save_reopen_and_update(self):
        self.assertEqual(self.client.get('/api/flyers/').status_code, 401)
        self.client.force_authenticate(self.owner)
        created = self.client.post('/api/flyers/', self.payload, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        url = f"/api/flyers/{created.data['id']}/"
        self.assertEqual(self.client.get(url).data['design'], self.payload['design'])
        summary = self.client.get('/api/flyers/').data['results'][0]
        self.assertEqual(summary['name'], self.payload['name'])
        self.assertEqual(summary['kind'], 'flyer')
        self.assertNotIn('products', summary)
        self.payload['products'][0]['price'] = '17,90'
        self.assertEqual(self.client.put(url, self.payload, format='json').status_code, 200)
        self.assertEqual(self.client.get(url).data['products'], self.payload['products'])

        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get('/api/flyers/').data['count'], 0)
        self.assertEqual(self.client.get('/api/flyers/?kind=all').data['count'], 0)
        self.assertEqual(self.client.get(url).status_code, 404)
        self.assertEqual(self.client.put(url, self.payload, format='json').status_code, 404)

    def test_invalid_layout_image_and_product_count_are_rejected(self):
        self.client.force_authenticate(self.owner)
        self.payload['design']['layout'] = 5
        self.payload['products'][0]['imageUrl'] = 'data:image/svg+xml;base64,AAAA'
        response = self.client.post('/api/flyers/', self.payload, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('layout', response.data['design'])
        self.assertIn('imageUrl', response.data['products'][0])
        self.payload['design']['layout'] = 16
        self.payload['products'][0]['imageUrl'] = ''
        self.payload['products'] *= 101
        self.assertEqual(self.client.post('/api/flyers/', self.payload, format='json').status_code, 400)

    def test_design_customization_and_single_featured_product(self):
        self.client.force_authenticate(self.owner)
        self.payload['design'].update(template='professional', storeName='Minha Loja', border='strong', badge='burst')
        self.payload['design'].update(logoScale=160, storeNameColor='#226644', subtitleColor='#889966', categoryTextColor='#ffee44')
        self.payload['design']['lockedLayers'] = ['logo']
        self.payload['design']['layerPositions'] = {
            layer: {'x': -25, 'y': 40}
            for layer in ('logo', 'storeName', 'subtitle', 'category', 'backgroundImage')
        }
        self.payload['products'][0]['featured'] = True
        self.payload['products'][0]['lockedLayers'] = ['photo', 'offer']
        self.payload['products'][0].update(photoScale=160, photoX=20, photoY=-15, detailPhotos=['https://example.com/detail.png'], offerLabel='SUPER OFERTA')
        self.payload['products'][0].update(offerColor='#6837ad', discountColor='#ffd635', oldPriceColor='#557799')
        self.payload['products'][0]['textPositions'] = {
            'name': {'x': -20, 'y': 10}, 'originalPrice': {'x': 0, 'y': 50}, 'offer': {'x': 50, 'y': -50},
        }
        self.payload['products'][0]['cardPosition'] = {'x': 75, 'y': -30}
        self.payload['products'][0]['glow'] = {'enabled': True, 'color': '#416eff', 'intensity': 200, 'blur': 7}
        response = self.client.post('/api/flyers/', self.payload, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        saved = self.client.get(f"/api/flyers/{response.data['id']}/")
        self.assertEqual(saved.data['design'], self.payload['design'])
        self.assertTrue(saved.data['products'][0]['featured'])
        self.assertEqual(saved.data['products'][0], self.payload['products'][0])
        self.payload['products'].append({**self.payload['products'][0], 'name': 'Chá'})
        self.assertEqual(self.client.post('/api/flyers/', self.payload, format='json').status_code, 400)

    def test_print_project_round_trip_and_page_fit_validation(self):
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.post('/api/flyers/', self.payload, format='json').status_code, 201)
        self.payload['name'] = 'Etiquetas da semana'
        settings = {
            'kind': 'labels', 'paper': 'A4', 'mode': 'single', 'margin': 8,
            'labelWidth': 65.5, 'labelHeight': 40, 'copies': 3, 'selectedProduct': 0,
            'photoPosition': 'right', 'textAlign': 'left',
        }
        self.payload['design']['print'] = settings
        created = self.client.post('/api/flyers/', self.payload, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        url = f"/api/flyers/{created.data['id']}/"
        self.assertEqual(self.client.get(url).data['design']['print'], settings)
        self.assertEqual(self.client.get('/api/flyers/').data['count'], 1)
        self.assertEqual(self.client.get('/api/flyers/?kind=print').data['results'][0]['id'], created.data['id'])
        settings.update(kind='poster', paper='A3', mode='bulk', orientation='landscape')
        self.payload['design']['template'] = 'professional'
        self.assertEqual(self.client.put(url, self.payload, format='json').status_code, 200)
        self.assertEqual(self.client.get(url).data['design']['print'], settings)
        self.assertEqual(self.client.get(url).data['design']['template'], 'professional')
        settings['orientation'] = 'diagonal'
        self.assertEqual(self.client.put(url, self.payload, format='json').status_code, 400)
        settings['orientation'] = 'portrait'
        product = self.payload['products'][0]
        product.update(price='25,90', imageUrl='data:image/png;base64,AAAA')
        invalid = self.client.put(url, self.payload, format='json')
        self.assertEqual(invalid.status_code, 400)
        self.assertIn('price', invalid.data['products'][0])
        self.assertIn('imageUrl', invalid.data['products'][0])
        product.update(price='17,90', imageUrl='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5uoAAAAASUVORK5CYII=')
        self.assertEqual(self.client.put(url, self.payload, format='json').status_code, 200)
        settings.update(kind='labels', labelWidth=200)
        self.assertEqual(self.client.put(url, self.payload, format='json').status_code, 400)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get('/api/flyers/?kind=print').data['count'], 0)
        self.assertEqual(self.client.get(url).status_code, 404)

    def test_label_codes_and_owner_only_deletion(self):
        self.client.force_authenticate(self.owner)
        self.payload['design']['print'] = {
            'kind': 'labels', 'paper': 'A4', 'mode': 'single', 'margin': 8,
            'labelWidth': 65, 'labelHeight': 40, 'copies': 1, 'selectedProduct': 0,
            'photoPosition': 'top', 'textAlign': 'center',
        }
        product = self.payload['products'][0]
        product.update(saleUnit='kg', barcode='0123456789013', qrUrl='https://example.com/cafe')
        self.assertEqual(self.client.post('/api/flyers/', self.payload, format='json').status_code, 400)
        product['barcode'] = '0123456789012'
        response = self.client.post('/api/flyers/', self.payload, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        url = f"/api/flyers/{response.data['id']}/"
        self.assertEqual(self.client.get(url).data['products'], [product])
        self.assertEqual(self.client.get('/api/flyers/?kind=labels').data['count'], 1)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.delete(url).status_code, 404)
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.delete(url).status_code, 204)

    def test_story_project_stays_in_its_editor(self):
        self.client.force_authenticate(self.owner)
        self.payload['design']['story'] = 'instagram'
        response = self.client.post('/api/flyers/', self.payload, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        url = f"/api/flyers/{response.data['id']}/"
        self.assertEqual(self.client.get(url).data['design']['story'], 'instagram')
        self.assertEqual(self.client.get('/api/flyers/?kind=story').data['count'], 1)
        self.assertEqual(self.client.get('/api/flyers/').data['count'], 0)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(url).status_code, 404)

    def test_published_menu_is_read_only_current_and_revocable(self):
        self.client.force_authenticate(self.owner)
        self.payload['design']['menu'] = 'mobile'
        self.payload['products'][0]['description'] = 'Café coado na hora'
        created = self.client.post('/api/flyers/', self.payload, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        editor_url = f"/api/flyers/{created.data['id']}/"
        shares = f'{editor_url}shares/'
        published = self.client.post(shares, {'label': 'Cardápio digital'}, format='json')
        self.assertEqual(published.status_code, 201, published.data)
        public_url = f"/api/public/projects/{published.data['token']}/"
        revoke_url = f"{shares}{published.data['id']}/"

        self.client.force_authenticate(None)
        public = self.client.get(public_url)
        self.assertEqual(public.status_code, 200)
        self.assertEqual(set(public.data), {'kind', 'name', 'revision', 'design', 'products'})
        self.assertEqual(public.data['products'][0]['description'], 'Café coado na hora')
        self.assertEqual(public['Cache-Control'], 'no-store')
        self.assertEqual(self.client.put(public_url, self.payload, format='json').status_code, 405)
        self.assertEqual(self.client.get(shares).status_code, 401)

        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.post(shares, {'label': 'Outro'}, format='json').status_code, 404)
        self.assertEqual(self.client.delete(revoke_url).status_code, 404)
        self.client.force_authenticate(self.owner)
        self.payload['products'][0]['price'] = '16,90'
        self.assertEqual(self.client.put(editor_url, self.payload, format='json').status_code, 200)
        self.assertEqual(self.client.get(public_url).data['products'][0]['price'], '16,90')
        self.assertEqual(self.client.delete(revoke_url).status_code, 204)
        self.assertEqual(self.client.get(public_url).status_code, 404)

    def test_tv_links_are_independent_and_skip_unchanged_playlists(self):
        self.client.force_authenticate(self.owner)
        self.payload['design'].update(tv=True, video={'orientation': 'horizontal', 'transition': 'slide', 'duration': 5})
        self.payload['products'][0].update(duration=7, slideImageUrl='https://example.com/banner.png')
        created = self.client.post('/api/flyers/', self.payload, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        editor_url = f"/api/flyers/{created.data['id']}/"
        shares = f'{editor_url}shares/'
        first = self.client.post(shares, {'label': 'TV do caixa'}, format='json').data
        second = self.client.post(shares, {'label': 'TV da vitrine'}, format='json').data
        self.assertNotEqual(first['token'], second['token'])
        self.assertEqual(self.client.get('/api/flyers/?kind=tv').data['count'], 1)
        self.assertEqual(self.client.get('/api/flyers/?kind=video').data['count'], 0)
        url = f"/api/public/projects/{first['token']}/"
        second_url = f"/api/public/projects/{second['token']}/"
        self.client.force_authenticate(None)
        response = self.client.get(url)
        self.assertEqual(response.data['kind'], 'tv')
        self.assertEqual(response.data['products'][0]['duration'], 7)
        self.assertEqual(response.data['products'][0]['slideImageUrl'], 'https://example.com/banner.png')
        revision = response.data['revision']
        self.assertEqual(self.client.get(url, {'revision': revision}).status_code, 204)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(shares).status_code, 404)
        self.assertEqual(self.client.delete(f"{shares}{first['id']}/").status_code, 404)
        self.client.force_authenticate(self.owner)
        self.payload['products'][0]['name'] = 'Oferta atualizada'
        self.assertEqual(self.client.put(editor_url, self.payload, format='json').status_code, 200)
        self.assertEqual(self.client.get(url, {'revision': revision}).data['products'][0]['name'], 'Oferta atualizada')
        self.assertEqual(self.client.delete(f"{shares}{first['id']}/").status_code, 204)
        self.assertEqual(self.client.get(url).status_code, 404)
        self.assertEqual(self.client.get(second_url).status_code, 200)

    def test_video_project_round_trip_duration_and_visibility(self):
        self.client.force_authenticate(self.owner)
        self.payload['design']['video'] = {
            'orientation': 'vertical', 'transition': 'zoom', 'duration': 6,
            'footerText': 'Consulte as ofertas na loja', 'footerColor': '#103b32',
            'footerTextColor': '#f2faf4', 'backgroundOpacity': 70,
        }
        self.payload['products'][0]['duration'] = 3
        created = self.client.post('/api/flyers/', self.payload, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        url = f"/api/flyers/{created.data['id']}/"
        self.assertEqual(self.client.get(url).data['design']['video'], self.payload['design']['video'])
        self.assertEqual(self.client.get(url).data['products'][0]['duration'], 3)
        self.assertEqual(self.client.get('/api/flyers/?kind=video').data['count'], 1)
        self.assertEqual(self.client.get('/api/flyers/?kind=all').data['results'][0]['kind'], 'video')
        self.assertEqual(self.client.get('/api/flyers/?kind=print').data['count'], 0)
        self.assertEqual(self.client.get('/api/flyers/').data['count'], 0)
        self.payload['products'][0]['duration'] = 0
        self.assertEqual(self.client.put(url, self.payload, format='json').status_code, 400)
        self.payload['products'][0]['duration'] = 10
        self.payload['design']['video']['transition'] = 'slide'
        self.assertEqual(self.client.put(url, self.payload, format='json').status_code, 200)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get('/api/flyers/?kind=video').data['count'], 0)
        self.assertEqual(self.client.get(url).status_code, 404)
