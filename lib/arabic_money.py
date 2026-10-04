"""Deterministic Arabic wording of integer dinars and fils; no float rounding."""

_ONES = ('', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة')
_TEENS = ('عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر',
          'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر')
_TENS = ('', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون')
_HUNDREDS = ('', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة',
             'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة')


def _small(number, construct=False):
    hundreds, rest = divmod(number, 100)
    parts = []
    if hundreds:
        parts.append('مائتا' if hundreds == 2 and rest == 0 and construct else _HUNDREDS[hundreds])
    if rest < 10:
        tail = _ONES[rest]
    elif rest < 20:
        tail = _TEENS[rest - 10]
    else:
        tens, ones = divmod(rest, 10)
        tail = (_ONES[ones] + ' و' if ones else '') + _TENS[tens]
    if tail:
        parts.append(tail)
    return ' و'.join(parts)


def _integer(number):
    parts = []
    for scale, singular, dual, attached_dual, plural in [
        (1000000, 'مليون', 'مليونان', 'مليونا', 'ملايين'),
        (1000, 'ألف', 'ألفان', 'ألفا', 'آلاف'),
    ]:
        count, number = divmod(number, scale)
        if not count:
            continue
        if count == 1:
            part = singular
        elif count == 2:
            part = dual if number else attached_dual
        else:
            noun = plural if 3 <= count % 100 <= 10 else singular + ('ًا' if count % 100 and number else '')
            part = _small(count, construct=True) + ' ' + noun
        parts.append(part)
    if number:
        parts.append(_small(number, construct=True))
    return ' و'.join(parts)


def _currency(number, singular, dual, plural, accusative):
    if number == 1:
        return singular + ' واحد'
    if number == 2:
        return dual
    ending = plural if 3 <= number % 100 <= 10 else accusative if number % 100 else singular
    return _integer(number) + ' ' + ending


def kwd_words(value):
    """Use the receipt's existing positive-amount validation and exact 1/1000 split."""
    from lib.rent_pdf import money
    amount = money(value)
    dinars, fils = divmod(int(amount * 1000), 1000)
    parts = []
    if dinars:
        parts.append(_currency(dinars, 'دينار كويتي', 'ديناران كويتيان', 'دنانير كويتية', 'دينارًا كويتيًا'))
    if fils:
        parts.append(_currency(fils, 'فلس', 'فلسان', 'فلوس', 'فلسًا'))
    return 'فقط ' + ' و'.join(parts) + ' لا غير'
