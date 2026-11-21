import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from catalog.engine.families import family_of_hex
from core.tests.factories import ProductFactory
from recommender.engine.tone_picks import group_candidates, tone_picks
from recommender.models import ToneColorRule
from recommender.tests.helpers import HEX, item, palette

pytestmark = pytest.mark.django_db


def product(name, slot, gender, colour="Navy Blue", *, kind="", compatible="All", stock=10, status="Active", **extra):
    return ProductFactory(
        name=name, slot=slot, gender=gender, kind=kind or None,
        color_name=colour, color_hex=HEX[colour], compatible_skin_tone=compatible,
        stock_quantity=stock, status=status, category=f"{gender.title()} {slot} {name}", **extra,
    )


def full_catalog(gender="men"):
    product("Shirt A", "top", gender)
    product("Shirt B", "top", gender)
    product("Pant A", "bottom", gender)
    product("Pant B", "bottom", gender)
    product("Cap A", "accessory", gender, kind="cap")
    product("Cap B", "accessory", "unisex", kind="cap")
    product("Glasses A", "accessory", gender, kind="sunglasses")
    product("Glasses B", "accessory", "unisex", kind="sunglasses")


# ---- pure engine ----------------------------------------------------------------------------------------

def test_groups_map_the_right_slots_and_keep_only_the_gender_and_unisex():
    items = [
        item("top", name="men shirt"),
        item("top", gender="women", name="women top"),
        item("top", gender="unisex", name="unisex shirt"),
        item("kurta", gender="women", name="women kurta"),
        item("bottom", gender="women", name="women bottom"),
        item("accessory", name="Cap", kind="cap"),
        item("accessory", name="Sunglasses", kind="sunglasses"),
        item("top", name="kid shirt", kids=True),
    ]
    cups = {key: candidates for key, _, _, candidates in group_candidates(items, "men")}
    assert {i.name for i in cups["shirts"]} == {"men shirt", "unisex shirt"}
    assert all(i.gender != "women" for group in cups.values() for i in group)
    assert {i.name for i in cups["caps"]} == {"Cap"}
    assert {i.name for i in cups["glasses"]} == {"Sunglasses"}
    women = {key: candidates for key, _, _, candidates in group_candidates(items, "women")}
    assert {i.name for i in women["tops"]} == {"women top", "unisex shirt", "women kurta"}


def test_a_watch_mistagged_as_a_cap_never_fills_the_caps_group():
    items = [
        item("accessory", name="Silver Chrono Watch", kind="cap"),
        item("accessory", name="ADIDAS Blue Cap", kind="cap"),
    ]
    groups = tone_picks(items, "Fair", "men", palette(Navy_Blue=2))
    caps = next(g for g in groups if g.key == "caps")
    assert [i.name for i in caps.items] == ["ADIDAS Blue Cap"]


def test_palette_order_then_variety_then_mannequin_then_id_is_deterministic():
    p = palette(Navy_Blue=2, Beige=2, Black=2)
    items = [
        item("top", "Black", name="black", id=1, ready=False),
        item("top", "Navy Blue", name="navy", id=5),
        item("top", "Beige", name="beige", id=6),
    ]
    first = tone_picks(items, "Fair", "men", p)[0].items
    second = tone_picks(list(reversed(items)), "Fair", "men", p)[0].items
    assert [i.name for i in first] == ["navy", "beige"] == [i.name for i in second]
    assert len({family_of_hex(i.color_hex) for i in first}) == 2


def test_avoid_is_skipped_while_a_non_avoid_exists_but_used_when_nothing_else_does():
    p = palette(Navy_Blue=2, Hot_Pink=-2)
    groups = tone_picks(
        [item("top", "Hot Pink", name="pink"), item("top", "Navy Blue", name="navy")], "Fair", "men", p,
    )
    assert [i.name for i in groups[0].items] == ["navy"]
    only_avoid = tone_picks([item("top", "Hot Pink", name="pink")], "Fair", "men", p)
    assert only_avoid[0].short and only_avoid[0].items[0].color_name == "Hot Pink"


def test_a_short_group_returns_what_exists_and_is_flagged():
    groups = tone_picks([item("top")], "Fair", "men", palette(Navy_Blue=2))
    shirts = next(g for g in groups if g.key == "shirts")
    assert shirts.short and len(shirts.items) == 1
    assert all(g.short and not g.items for g in groups if g.key != "shirts")


# ---- endpoint -------------------------------------------------------------------------------------------

def test_tone_picks_has_four_groups_and_two_cards_for_every_gender_and_tone(api_client):
    full_catalog("men")
    full_catalog("women")
    for gender, keys in (("men", ["shirts", "pants", "caps", "glasses"]),
                         ("women", ["tops", "bottoms", "caps", "glasses"])):
        for tone in ("fair", "medium", "dark"):
            body = api_client.get(f"/api/recommendations/tone-picks/?tone={tone}&gender={gender}&undertone=warm").json()
            assert body["status"] == "success" and body["tone"] == tone.title() and body["gender"] == gender
            assert [g["key"] for g in body["groups"]] == keys
            assert all(len(g["items"]) == 2 and not g["short"] for g in body["groups"])
            assert body["short_groups"] == []


def test_tone_picks_is_public_and_rejects_bad_input(api_client):
    assert api_client.get("/api/recommendations/tone-picks/?tone=fair&gender=men").status_code == 200
    for query in ("tone=nope&gender=men", "tone=fair&gender=boys", "tone=fair&gender=men&undertone=green", "gender=men"):
        response = api_client.get(f"/api/recommendations/tone-picks/?{query}")
        assert response.status_code == 400 and response.json()["status"] == "error"


def test_tone_picks_never_mixes_genders_and_keeps_unisex_for_both(api_client):
    for name, gender in (("Men top", "men"), ("Women top", "women"), ("Unisex top", "unisex")):
        product(name, "top", gender)
    men = api_client.get("/api/recommendations/tone-picks/?tone=fair&gender=men").json()
    women = api_client.get("/api/recommendations/tone-picks/?tone=fair&gender=women").json()
    assert {i["name"] for i in men["groups"][0]["items"]} == {"Men top", "Unisex top"}
    assert {i["name"] for i in women["groups"][0]["items"]} == {"Women top", "Unisex top"}


def test_tone_picks_drops_a_product_that_excludes_the_tone_and_keeps_all(api_client):
    product("Fair only", "top", "men", compatible="Fair")
    product("Medium only", "top", "men", compatible="Medium")
    product("Everyone", "top", "men", compatible="All")
    names = {i["name"] for i in api_client.get("/api/recommendations/tone-picks/?tone=medium&gender=men").json()["groups"][0]["items"]}
    assert names == {"Medium only", "Everyone"}


def test_tone_picks_hides_drafts_inactive_and_out_of_stock(api_client):
    product("ok", "top", "men")
    product("draft", "top", "men", status="Draft")
    product("inactive", "top", "men", status="Inactive")
    product("empty", "top", "men", stock=0)
    names = [i["name"] for i in api_client.get("/api/recommendations/tone-picks/?tone=fair&gender=men").json()["groups"][0]["items"]]
    assert names == ["ok"]


def test_the_palette_changes_the_picks_and_avoid_is_only_a_last_resort(api_client):
    navy = product("Navy shirt", "top", "men", "Navy Blue")
    pink = product("Pink shirt", "top", "men", "Hot Pink")
    ToneColorRule.objects.create(depth="Fair", undertone="neutral", color_name="Navy Blue", score=2)
    ToneColorRule.objects.create(depth="Fair", undertone="neutral", color_name="Hot Pink", score=-2)
    first = api_client.get("/api/recommendations/tone-picks/?tone=fair&gender=men").json()["groups"][0]["items"]
    assert [i["name"] for i in first] == ["Navy shirt"]

    navy.delete()
    second = api_client.get("/api/recommendations/tone-picks/?tone=fair&gender=men").json()["groups"][0]["items"]
    assert [i["name"] for i in second] == ["Pink shirt"] and pink.pk


def test_tone_picks_are_repeatable_and_list_short_groups(api_client):
    product("Only cap", "accessory", "men", kind="cap")
    url = "/api/recommendations/tone-picks/?tone=dark&gender=men"
    first = APIClient().get(url).json()
    second = APIClient().get(url).json()
    assert first == second
    assert first["short_groups"] == ["shirts", "pants", "caps", "glasses"]
    assert first["groups"][2]["items"][0]["name"] == "Only cap"


def test_tone_picks_uses_the_scan_undertone_when_given(api_client):
    product("Warm pick", "top", "men", "Camel")
    product("Cool pick", "top", "men", "Royal Blue")
    ToneColorRule.objects.create(depth="Medium", undertone="warm", color_name="Camel", score=2)
    ToneColorRule.objects.create(depth="Medium", undertone="warm", color_name="Royal Blue", score=-2)
    ToneColorRule.objects.create(depth="Medium", undertone="cool", color_name="Royal Blue", score=2)
    ToneColorRule.objects.create(depth="Medium", undertone="cool", color_name="Camel", score=-2)
    warm = api_client.get("/api/recommendations/tone-picks/?tone=medium&gender=men&undertone=warm").json()
    cool = api_client.get("/api/recommendations/tone-picks/?tone=medium&gender=men&undertone=cool").json()
    assert warm["undertone"] == "warm" and warm["groups"][0]["items"][0]["name"] == "Warm pick"
    assert cool["groups"][0]["items"][0]["name"] == "Cool pick"


def test_audit_command_prints_counts_and_names(capsys, api_client):
    full_catalog("men")
    call_command("audit_tone_picks")
    out = capsys.readouterr().out
    assert "MEN / FAIR" in out and "WOMEN / DARK" in out
    assert "Shirts: 2 eligible -> Shirt A, Shirt B" in out
    assert "Caps: 2 eligible -> Cap A, Cap B" in out


def test_recommended_api_honours_gender_too(api_client):
    product("Men top", "top", "men")
    product("Women top", "top", "women")
    product("Unisex top", "top", "unisex")
    body = api_client.get("/api/recommendations/top/?depth=Fair&gender=women").json()
    assert {i["name"] for i in body["items"]} == {"Women top", "Unisex top"}
