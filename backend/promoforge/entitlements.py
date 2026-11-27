from rest_framework.exceptions import PermissionDenied, ValidationError


FEATURES = ('flyer', 'labels', 'video', 'cutout', 'premium', 'bulk')
PLAN_RULES = {
    'free': {'stores': 1, 'batch': 5, 'features': ('flyer', 'labels', 'video', 'cutout', 'bulk'), 'formats': ('png', 'zip', 'mp4', 'webm')},
    'pro': {'stores': 3, 'batch': 50, 'features': FEATURES, 'formats': ('png', 'jpeg', 'pdf', 'zip', 'mp4', 'webm')},
    'business': {'stores': 10, 'batch': 1000, 'features': (*FEATURES, 'custom_templates'), 'formats': ('png', 'jpeg', 'pdf', 'zip', 'mp4', 'webm')},
}
COSTS = {'banner': 1, 'flyer': 2, 'poster': 1, 'labels': 1, 'video': 5, 'cutout': 1, 'story': 1, 'menu': 2}
FREE_COSTS = {**COSTS, 'poster': 2, 'labels': 2, 'video': 2}


def plan_costs(code):
    return FREE_COSTS if code == 'free' else COSTS


def plan_rules(code):
    return PLAN_RULES.get(code, PLAN_RULES['free'])


def require_feature(code, feature):
    if feature == 'custom_templates':
        if feature in plan_rules(code)['features']:
            return
        raise PermissionDenied('Templates personalizados exigem o plano Business. Consulte Planos e créditos.')
    if feature not in plan_rules(code)['features']:
        raise PermissionDenied('Este recurso exige o plano Pro ou Business. Consulte Planos e créditos.')


def authorize_operation(code, kind, count, format):
    rules = plan_rules(code)
    if kind in FEATURES:
        require_feature(code, kind)
    if count > 1 or format == 'zip':
        require_feature(code, 'bulk')
    if format not in rules['formats']:
        raise PermissionDenied('Este formato exige o plano Pro ou Business. Consulte Planos e créditos.')
    if count > rules['batch']:
        raise ValidationError(f'O plano permite até {rules["batch"]} unidades por lote.')
