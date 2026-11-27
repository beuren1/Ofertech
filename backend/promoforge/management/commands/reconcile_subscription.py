from django.core.management.base import BaseCommand, CommandError
from rest_framework.exceptions import APIException

from promoforge.billing_models import PlanChange
from promoforge.recurring import reconcile_subscription


class Command(BaseCommand):
    help = 'Confere uma assinatura de teste e suas parcelas, sem criar cobranças no provedor.'

    def add_arguments(self, parser):
        parser.add_argument('change_id', type=int)
        parser.add_argument('--invoice', action='append', default=[])
        parser.add_argument('--apply', action='store_true')

    def handle(self, *args, **options):
        change = PlanChange.objects.filter(pk=options['change_id'], provider='mercado_pago', expected_amount__isnull=False).first()
        if not change:
            raise CommandError('Assinatura local não encontrada.')
        ids = tuple(dict.fromkeys(options['invoice']))
        if len(ids) > 25 or any(not value.isascii() or not value.isdecimal() or len(value) > 40 for value in ids):
            raise CommandError('Informe até 25 identificadores numéricos de parcelas.')
        ids = ids or tuple(change.invoices.order_by('-due_on').values_list('provider_id', flat=True)[:25])
        if not options['apply']:
            self.stdout.write(f'Consulta local. Estado: {change.status}. Parcelas selecionadas: {len(ids)}.')
            return
        try:
            reconcile_subscription(change, ids)
        except APIException as error:
            raise CommandError('Reconciliação interrompida. Verifique o estado da assinatura de teste e os logs sanitizados.') from error
        self.stdout.write(f'Reconciliação concluída. Parcelas verificadas: {len(ids)}.')
