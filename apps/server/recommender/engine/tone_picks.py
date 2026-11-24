"""Pick two shop products per garment group for a skin tone. Pure Python, no Django.

The catalog decides which products are eligible (gender and skin tone); this module only applies the
colour and variety rules, so it can be tested without a database.
"""
from dataclasses import dataclass

from catalog.engine.families import family_of_hex, family_of_label

from .items import accessory_kind, colour_label

LIMIT = 2


@dataclass(frozen=True)
class ToneGroup:
    key: str
    label: str
    slots: tuple
    items: tuple          # up to two Items, best first
    short: bool           # fewer than two eligible products


def _groups(gender):
    if gender == "women":
        return (
            ("tops", "Tops", ("top", "kurta")),
            ("bottoms", "Bottoms", ("bottom",)),
            ("caps", "Caps", ("headwear",)),
            ("glasses", "Glasses", ("eyewear",)),
        )
    return (
        ("shirts", "Shirts", ("top",)),
        ("pants", "Pants", ("bottom",)),
        ("caps", "Caps", ("headwear",)),
        ("glasses", "Glasses", ("eyewear",)),
    )


def _cap(item):
    """A cap is an accessory tagged cap whose name is a cap, not an accessory mis-tagged through its category."""
    return (
        item.slot == "accessory"
        and accessory_kind(item) == "cap"
        and ("cap" in item.name.lower() or "beanie" in item.name.lower())
    )


def _glasses(item):
    return item.slot == "accessory" and accessory_kind(item) == "sunglasses"


def _in_group(item, key):
    if key == "caps":
        return _cap(item)
    if key == "glasses":
        return _glasses(item)
    if key == "shirts":
        return item.slot == "top"
    if key == "tops":
        return item.slot in ("top", "kurta")
    return item.slot == "bottom"


def _family(item):
    if item.color_hex:
        return family_of_hex(item.color_hex)
    return family_of_label(colour_label(item))


def _ranked(candidates, palette):
    allowed = [item for item in candidates if palette.score_item(item) > -2]
    # An avoid colour is only used when the group has no other option at all.
    pool = allowed or candidates
    return sorted(pool, key=lambda item: (-palette.score_item(item), not item.ready, item.id))


def _choose(candidates, palette, limit=LIMIT):
    ordered = _ranked(candidates, palette)
    if not ordered:
        return ()
    chosen = [ordered[0]]
    first_family = _family(ordered[0])
    # Prefer a second colour family; fall back to the best remaining product when every option repeats it.
    for item in ordered[1:]:
        family = _family(item)
        if family and first_family and family != first_family:
            chosen.append(item)
            break
    if len(chosen) < min(limit, len(ordered)):
        for item in ordered:
            if item not in chosen:
                chosen.append(item)
                if len(chosen) == limit:
                    break
    return tuple(chosen[:limit])


def group_candidates(items, gender):
    """The four groups for a gender, each with every eligible Item (gender already re-checked here)."""
    if gender not in ("men", "women"):
        raise ValueError("gender must be men or women")
    return tuple(
        (key, label, slots, tuple(
            item for item in items
            if item.gender in (gender, "unisex") and not item.is_kids and _in_group(item, key)
        ))
        for key, label, slots in _groups(gender)
    )


def tone_picks(items, tone, gender, palette, undertone="", limit=LIMIT):
    """Return the four groups in display order for one gender and tone.

    ``items`` is expected to be the eligible catalog already filtered by gender and tone. Gender is checked
    again here as a hard rule; unisex products are the only cross-gender exception. A group is short when
    fewer than ``limit`` eligible products exist, and then it returns exactly what exists.
    """
    if tone not in ("Fair", "Medium", "Dark"):
        raise ValueError("tone must be Fair, Medium or Dark")

    groups = []
    for key, label, slots, candidates in group_candidates(items, gender):
        picked = _choose(candidates, palette, limit)
        groups.append(ToneGroup(key=key, label=label, slots=slots, items=picked, short=len(picked) < limit))
    return tuple(groups)
