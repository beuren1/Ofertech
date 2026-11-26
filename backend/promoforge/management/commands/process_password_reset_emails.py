from time import sleep

from django.core.management.base import BaseCommand, CommandError
from django.db import close_old_connections

from ...auth_security import process_reset_deliveries


class Command(BaseCommand):
    help = 'Processa a fila de e-mails de redefinição de senha da Ofertech.'

    def add_arguments(self, parser):
        parser.add_argument('--watch', action='store_true')
        parser.add_argument('--limit', type=int, default=25)

    def handle(self, *args, **options):
        if not 1 <= options['limit'] <= 100:
            raise CommandError('Informe um limite entre 1 e 100.')
        process_reset_deliveries(limit=options['limit'])
        if not options['watch']:
            return
        while True:
            try:
                sleep(5)
            except KeyboardInterrupt:
                return
            close_old_connections()
            process_reset_deliveries(limit=options['limit'])
