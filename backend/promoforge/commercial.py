import csv
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Exists, OuterRef, Q, Sum
from django.db.models.functions import Coalesce, TruncDate
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.generics import GenericAPIView
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .billing import billing_account, plan_data
from .billing_models import CreditMovement, Plan, PlanChange, RecurringInvoice, SubscriptionPayment
from .models import CreditAdjustment, FlyerProject, PrintExport, ProjectShare, UserActiveDay, VideoExport


User = get_user_model()


class IsCommercialOwner(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return user.is_authenticated and user.is_active and user.is_staff and user.is_superuser


class CommercialAPIView(APIView):
    permission_classes = [IsCommercialOwner]

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response['Cache-Control'] = 'private, no-store'
        return response


class CommercialListView(CommercialAPIView, GenericAPIView):
    def list_data(self, queryset, represent):
        page = self.paginate_queryset(queryset)
        return self.get_paginated_response([represent(item) for item in page])


class ReportingPeriod(serializers.Serializer):
    start = serializers.DateField(required=False)
    end = serializers.DateField(required=False)

    def validate(self, attrs):
        end = attrs.get('end', timezone.localdate())
        start = attrs.get('start', end - timedelta(days=min(29, (end - date.min).days)))
        if end < start or (end - start).days > 365:
            raise serializers.ValidationError('Escolha um intervalo de até 366 dias, com início anterior ou igual ao fim.')
        return {'start': start, 'end': end}


def reporting_period(request):
    period = ReportingPeriod(data=request.query_params)
    period.is_valid(raise_exception=True)
    return period.validated_data


def confirmed_payments():
    # The recurring integration records "approved" only after verifying accreditation and amount.
    return SubscriptionPayment.objects.filter(
        status='approved', invoice__change__provider='mercado_pago', invoice__change__expected_amount__gt=0,
    ).annotate(payment_day=Coalesce(TruncDate('updated_at'), 'invoice__due_on'))


def daily_values(queryset, field, period, value):
    return {
        row['day']: row['total']
        for row in queryset.filter(**{f'{field}__date__range': (period['start'], period['end'])})
        .annotate(day=TruncDate(field)).values('day').annotate(total=value).order_by()
    }


def commercial_metrics(period):
    start, end = period['start'], period['end']
    projects = FlyerProject.objects.all()
    sources = {
        'credits_consumed': (CreditMovement.objects.exclude(kind='adjustment').filter(amount__lt=0), 'created_at', -Sum('amount')),
        'registrations': (User.objects.all(), 'date_joined', Count('pk')),
        'banners': (CreditMovement.objects.filter(kind='generation', amount__lt=0), 'created_at', -Sum('amount')),
        'flyers': (projects.exclude(design__has_any_keys=['print', 'video', 'story', 'menu']), 'created_at', Count('pk')),
        'posters': (projects.filter(design__print__kind='poster'), 'created_at', Count('pk')),
        'labels': (projects.filter(design__print__kind='labels'), 'created_at', Count('pk')),
        'poster_exports': (PrintExport.objects.filter(kind='poster'), 'created_at', Sum('quantity')),
        'label_exports': (PrintExport.objects.filter(kind='labels'), 'created_at', Sum('quantity')),
        'video_projects': (projects.filter(design__has_key='video').exclude(design__has_key='tv', design__tv=True), 'created_at', Count('pk')),
        'video_exports': (VideoExport.objects.all(), 'created_at', Count('pk')),
        'story_projects': (projects.filter(design__has_key='story'), 'created_at', Count('pk')),
        'story_exports': (CreditMovement.objects.filter(kind='story', amount__lt=0), 'created_at', Count('pk')),
        'menu_projects': (projects.filter(design__has_key='menu'), 'created_at', Count('pk')),
        'menu_exports': (CreditMovement.objects.filter(kind='menu', amount__lt=0), 'created_at', Count('pk')),
        'tv_playlists': (projects.filter(design__tv=True), 'created_at', Count('pk')),
        'tv_links': (ProjectShare.objects.filter(project__design__tv=True), 'created_at', Count('pk')),
    }
    daily = {key: daily_values(source, field, period, count) for key, (source, field, count) in sources.items()}
    activity = UserActiveDay.objects.filter(day__range=(start, end))
    daily['active_users'] = dict(activity.values('day').annotate(total=Count('user_id')).values_list('day', 'total'))
    days = []
    months = {}
    for offset in range((end - start).days + 1):
        day = start + timedelta(days=offset)
        row = {key: values.get(day, 0) for key, values in daily.items()}
        days.append({'date': day, **row})
        month = day.strftime('%Y-%m')
        months[month] = months.get(month, 0) + row['registrations']

    user_total = User.objects.count()
    plans = []
    today = timezone.localdate()
    for plan in Plan.objects.annotate(users=Count('subscription', filter=Q(subscription__paid_until__gt=today))).order_by('monthly_price', 'code'):
        users = plan.users
        if plan.code == 'free':
            users = user_total - User.objects.filter(subscription__paid_until__gt=today).exclude(subscription__plan_id='free').count()
        plans.append({**plan_data(plan), 'users': users})
    payments = confirmed_payments().filter(payment_day__range=(start, end))
    summary = payments.aggregate(count=Count('pk'), volume=Sum('invoice__change__expected_amount'))
    applied = RecurringInvoice.objects.filter(applied=True)
    period_cycles = applied.filter(due_on__range=(start, end))
    return {
        'period': period,
        'total_users': user_total,
        'active_users': activity.values('user_id').distinct().count(),
        'totals': {key: sum(values.values()) for key, values in daily.items() if key not in {'active_users', 'credits_consumed'}},
        'credits_consumed': sum(daily['credits_consumed'].values()),
        'days': days,
        'months': [{'month': month, 'registrations': count} for month, count in months.items()],
        'plans': plans,
        'billing': {
            'confirmed_payments': summary['count'],
            'confirmed_test_volume': str(summary['volume'] or Decimal('0.00')),
            'commercial_revenue': None,
            'applied_cycles': period_cycles.count(),
            'applied_renewals': period_cycles.filter(Exists(applied.filter(change_id=OuterRef('change_id'), due_on__lt=OuterRef('due_on')))).count(),
            'cancelled_subscriptions': PlanChange.objects.filter(status='cancelled', expected_amount__isnull=False).count(),
        },
    }


class CommercialOverviewView(CommercialAPIView):
    def get(self, request):
        return Response(commercial_metrics(reporting_period(request)))


class CommercialReportView(CommercialAPIView):
    def get(self, request):
        metrics = commercial_metrics(reporting_period(request))
        response = HttpResponse('\ufeff', content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="ofertech-relatorio.csv"'
        writer = csv.writer(response)
        writer.writerow([
            'data', 'cadastros', 'usuarios_ativos', 'banners', 'encartes', 'cartazes',
            'projetos_de_etiquetas', 'cartazes_exportados', 'etiquetas_exportadas', 'projetos_de_video', 'videos_exportados', 'creditos_consumidos',
            'projetos_de_stories', 'exportacoes_de_stories', 'projetos_de_cardapio', 'exportacoes_de_cardapio', 'playlists_de_tv', 'links_de_tv',
        ])
        columns = ('date', 'registrations', 'active_users', 'banners', 'flyers', 'posters', 'labels', 'poster_exports', 'label_exports',
                   'video_projects', 'video_exports', 'credits_consumed', 'story_projects', 'story_exports',
                   'menu_projects', 'menu_exports', 'tv_playlists', 'tv_links')
        for row in metrics['days']:
            writer.writerow(row[column] for column in columns)
        return response


def account_row(user, free_credits):
    account = getattr(user, 'subscription', None)
    today = timezone.localdate()
    paid = account and account.plan_id != 'free' and account.paid_until and account.paid_until > today
    active_free = account and account.plan_id == 'free' and account.period == today.replace(day=1)
    return {
        'id': user.pk, 'name': user.get_full_name(), 'email': user.email,
        'registered_at': user.date_joined, 'enabled': user.is_active,
        'plan': account.plan_id if paid else 'free',
        'credits': account.credits if paid or active_free else free_credits,
    }


class CommercialUsersView(CommercialListView):
    def get(self, request):
        return self.users('')

    def post(self, request):
        form = UserSearchInput(data=request.data)
        form.is_valid(raise_exception=True)
        return self.users(form.validated_data['search'])

    def users(self, search):
        users = User.objects.select_related('subscription').order_by('-date_joined', '-id')
        if search:
            query = Q(email__icontains=search) | Q(first_name__icontains=search) | Q(last_name__icontains=search)
            if search.isascii() and search.isdecimal() and len(search) <= 18:
                query |= Q(pk=int(search))
            users = users.filter(query)
        free_credits = Plan.objects.get(pk='free').monthly_credits
        return self.list_data(users, lambda user: account_row(user, free_credits))


class UserSearchInput(serializers.Serializer):
    search = serializers.CharField(max_length=150)


class CommercialHistoryView(CommercialListView):
    def get(self, request, user_id):
        user = get_object_or_404(User, pk=user_id)
        movements = CreditMovement.objects.filter(subscription__user=user).select_related('creditadjustment').order_by('-created_at', '-id')

        def represent(movement):
            audit = getattr(movement, 'creditadjustment', None)
            return {
                'id': movement.pk, 'date': movement.created_at, 'kind': movement.kind,
                'amount': movement.amount, 'balance': movement.balance,
                'adjustment': {
                    'actor_id': audit.actor_identifier, 'reason': audit.reason, 'previous_balance': audit.balance_before,
                } if audit else None,
            }

        return self.list_data(movements, represent)


class AdjustmentInput(serializers.Serializer):
    amount = serializers.IntegerField(min_value=-2147483647, max_value=2147483647)
    reason = serializers.CharField(min_length=5, max_length=500)
    operation = serializers.UUIDField()

    def validate_amount(self, amount):
        if not amount:
            raise serializers.ValidationError('Informe um ajuste diferente de zero.')
        return amount


class CommercialAdjustView(CommercialAPIView):
    @transaction.atomic
    def post(self, request, user_id):
        user = get_object_or_404(User, pk=user_id)
        form = AdjustmentInput(data=request.data)
        form.is_valid(raise_exception=True)
        amount, reason, operation = (form.validated_data[field] for field in ('amount', 'reason', 'operation'))
        key = f'admin:{operation}'
        with billing_account(user) as account:
            existing = CreditAdjustment.objects.filter(movement__subscription=account, movement__key=key).first()
            if existing:
                if (existing.actor_identifier, existing.amount, existing.reason) != (request.user.pk, amount, reason):
                    raise ValidationError('A identificação deste ajuste já está em uso.')
                return Response({'id': existing.pk, 'balance': account.credits})
            before = account.credits
            balance = before + amount
            if not 0 <= balance <= 2147483647:
                raise ValidationError('O ajuste deixaria o saldo fora do intervalo permitido.')
            account.credits = balance
            account.save(update_fields=['credits'])
            movement = CreditMovement.objects.create(
                subscription=account, key=key, kind='adjustment', amount=amount, balance=balance,
            )
            adjustment = CreditAdjustment.objects.create(
                movement=movement, actor_identifier=request.user.pk, target_identifier=user.pk,
                reason=reason, amount=amount, balance_before=before, balance_after=balance,
            )
        return Response({'id': adjustment.pk, 'balance': balance}, status=201)


class CommercialSubscriptionsView(CommercialListView):
    def get(self, request):
        changes = PlanChange.objects.filter(expected_amount__isnull=False).select_related('plan', 'subscription').order_by('-created_at', '-id')
        state = request.query_params.get('state', '').strip()[:24]
        if state:
            changes = changes.filter(status=state)
        return self.list_data(changes, lambda change: {
            'id': change.pk, 'user_id': change.subscription.user_id, 'plan': change.plan.name,
            'state': change.status, 'created_at': change.created_at,
            'paid_until': change.subscription.paid_until if change.subscription.paid_change_id == change.pk else None,
            'cancel_at_period_end': change.subscription.paid_change_id == change.pk and change.subscription.cancel_at_period_end,
        })


class CommercialPaymentsView(CommercialListView):
    def get(self, request):
        period = reporting_period(request)
        payments = confirmed_payments().filter(payment_day__range=(period['start'], period['end'])).select_related(
            'invoice__change__subscription', 'invoice__change__plan',
        ).order_by('-payment_day', 'provider_id')
        return self.list_data(payments, lambda payment: {
            'date': payment.payment_day, 'user_id': payment.invoice.change.subscription.user_id,
            'plan': payment.invoice.change.plan.name, 'amount': str(payment.invoice.change.expected_amount),
            'renewal_applied': payment.invoice.applied,
        })


class VideoExportView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        form = VideoExportInput(data=request.data)
        form.is_valid(raise_exception=True)
        VideoExport.objects.get_or_create(user=request.user, operation=form.validated_data['operation'])
        return Response(status=204)


class VideoExportInput(serializers.Serializer):
    operation = serializers.UUIDField()


class PrintExportInput(VideoExportInput):
    kind = serializers.ChoiceField(choices=['poster', 'labels'])
    quantity = serializers.IntegerField(min_value=1, max_value=1000)

    def validate(self, attrs):
        if attrs['kind'] == 'poster' and attrs['quantity'] > 100:
            raise serializers.ValidationError('Informe até 100 cartazes por exportação.')
        return attrs


class PrintExportView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        form = PrintExportInput(data=request.data)
        form.is_valid(raise_exception=True)
        data = form.validated_data
        PrintExport.objects.get_or_create(
            user=request.user, operation=data['operation'], defaults={'kind': data['kind'], 'quantity': data['quantity']},
        )
        return Response(status=204)
