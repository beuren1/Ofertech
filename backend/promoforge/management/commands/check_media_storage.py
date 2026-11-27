from django.conf import settings
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = 'Verifica o armazenamento de mídia sem criar nem remover arquivos.'

    def handle(self, *args, **options):
        if settings.MEDIA_STORAGE_MODE == 's3':
            from botocore.exceptions import BotoCoreError, ClientError

            try:
                default_storage.check_bucket()
            except (BotoCoreError, ClientError):
                raise CommandError('Mídia S3 inacessível. Confira o endpoint, o bucket e a permissão da chave.') from None
            self.stdout.write('Conexão com o bucket S3 verificada.')
            return

        if settings.ON_RENDER:
            raise CommandError('Configure a mídia privada R2 no Render.')
        self.stdout.write('Armazenamento local selecionado.')
