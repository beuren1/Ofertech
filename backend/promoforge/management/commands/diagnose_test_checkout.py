from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from promoforge.mercado_pago import checkout_blockers, configuration_blockers


class Command(BaseCommand):
    help = 'Lista os motivos que bloqueiam o checkout de teste, sem dados sensíveis.'

    def add_arguments(self, parser):
        parser.add_argument('--user-id', type=int)

    def handle(self, *args, **options):
        user_id = options['user_id']
        if user_id is None:
            blockers = configuration_blockers()
            self.stdout.write('Somente configuração. A conta compradora não foi verificada.')
        else:
            user = get_user_model().objects.filter(pk=user_id).only('email').first()
            if user is None:
                raise CommandError('Conta não encontrada.')
            blockers = checkout_blockers(user)
        self.stdout.write(', '.join(blockers) if blockers else 'Nenhum bloqueio local encontrado nos requisitos verificados.')
