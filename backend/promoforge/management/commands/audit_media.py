from django.core.management.base import BaseCommand, CommandError

from promoforge.models import Campaign, CampaignAsset, StoreBrand


class Command(BaseCommand):
    help = 'Conta referências de mídia sem arquivo acessível. Somente leitura e sem exibir caminhos.'

    def handle(self, *args, **options):
        missing_total = errors_total = 0
        for model, name in ((Campaign, 'thumbnail'), (CampaignAsset, 'file'), (StoreBrand, 'logo')):
            storage = model._meta.get_field(name).storage
            total = missing = errors = 0
            for path in model.objects.exclude(**{name: ''}).values_list(name, flat=True).iterator(chunk_size=500):
                if not path:
                    continue
                total += 1
                try:
                    if not storage.exists(path):
                        missing += 1
                except Exception:
                    errors += 1
            missing_total += missing
            errors_total += errors
            self.stdout.write(f'{model.__name__}.{name} total={total} ausentes={missing} erros_de_acesso={errors}')
        if missing_total or errors_total:
            raise CommandError('A verificação encontrou referências ausentes ou indisponíveis.')
