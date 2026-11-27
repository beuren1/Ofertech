from uuid import uuid4

from django.conf import settings
from django.db import models


class Plan(models.Model):
    code = models.SlugField(primary_key=True)
    name = models.CharField(max_length=80)
    monthly_credits = models.PositiveIntegerField()
    monthly_price = models.DecimalField(max_digits=9, decimal_places=2)


class Subscription(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT)
    period = models.DateField(null=True)
    monthly_limit = models.PositiveIntegerField(default=0)
    credits = models.PositiveIntegerField(default=0)
    cancel_at_period_end = models.BooleanField(default=False)
    paid_until = models.DateField(null=True)
    paid_change = models.ForeignKey('PlanChange', null=True, on_delete=models.SET_NULL, related_name='+')
    paid_pix_order = models.ForeignKey('PixOrder', null=True, on_delete=models.SET_NULL, related_name='+')


class CreditMovement(models.Model):
    subscription = models.ForeignKey(Subscription, on_delete=models.CASCADE)
    key = models.CharField(max_length=80)
    kind = models.CharField(max_length=16)
    payload_hash = models.CharField(max_length=64, blank=True)
    amount = models.IntegerField()
    balance = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['subscription', 'key'], name='unique_credit_operation'),
        ]


class PlanChange(models.Model):
    subscription = models.ForeignKey(Subscription, on_delete=models.CASCADE)
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT)
    provider = models.CharField(max_length=32, default='mercado_pago')
    provider_reference = models.CharField(max_length=128, blank=True)
    checkout_url = models.URLField(max_length=500, blank=True)
    expected_amount = models.DecimalField(max_digits=9, decimal_places=2, null=True)
    provider_version = models.PositiveIntegerField(null=True)
    status = models.CharField(max_length=24, default='pending_payment')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['provider', 'provider_reference'],
                condition=~models.Q(provider_reference=''),
                name='unique_remote_subscription',
            ),
        ]

    @property
    def external_reference(self):
        return f'promoforge-sub-{self.pk}'


class RecurringInvoice(models.Model):
    provider_id = models.CharField(max_length=40, primary_key=True)
    change = models.ForeignKey(PlanChange, on_delete=models.CASCADE, related_name='invoices')
    due_on = models.DateField()
    status = models.CharField(max_length=32)
    applied = models.BooleanField(default=False)


class SubscriptionPayment(models.Model):
    provider_id = models.CharField(max_length=40, primary_key=True)
    invoice = models.ForeignKey(RecurringInvoice, on_delete=models.CASCADE, related_name='payments')
    status = models.CharField(max_length=32)
    updated_at = models.DateTimeField(null=True)


class PixOrder(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    subscription = models.ForeignKey(Subscription, on_delete=models.CASCADE, related_name='pix_orders')
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT)
    amount = models.DecimalField(max_digits=9, decimal_places=2)
    credits = models.PositiveIntegerField()
    customer_id = models.CharField(max_length=80)
    environment = models.CharField(max_length=10, choices=[('sandbox', 'Sandbox'), ('production', 'Produção')], default='sandbox')
    payment_id = models.CharField(max_length=80, null=True)
    status = models.CharField(max_length=24, default='processing')
    open = models.BooleanField(default=True)
    due_on = models.DateField()
    qr_expires_at = models.DateTimeField(null=True)
    paid_until = models.DateField(null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['subscription', 'environment'], condition=models.Q(open=True), name='unique_open_pix_order_env'),
            models.UniqueConstraint(fields=['environment', 'payment_id'], name='unique_pix_payment_env'),
        ]

    @property
    def reference(self):
        prefix = 'ofertech-pix-prod-' if self.environment == 'production' else 'ofertech-pix-'
        return f'{prefix}{self.pk}'


class PixWebhookEvent(models.Model):
    id = models.CharField(max_length=139, primary_key=True)
    order = models.ForeignKey(PixOrder, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

