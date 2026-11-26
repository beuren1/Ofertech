from django.db import migrations


def set_prices(apps, schema_editor, pro, business):
    plans = apps.get_model('promoforge', 'Plan').objects.using(schema_editor.connection.alias)
    plans.filter(code='pro').update(monthly_price=pro)
    plans.filter(code='business').update(monthly_price=business)


def update_prices(apps, schema_editor):
    set_prices(apps, schema_editor, '19.99', '39.99')


def restore_prices(apps, schema_editor):
    set_prices(apps, schema_editor, '29.90', '59.90')


class Migration(migrations.Migration):
    dependencies = [('promoforge', '0004_plan_subscription_planchange_creditmovement')]

    operations = [migrations.RunPython(update_prices, restore_prices)]
