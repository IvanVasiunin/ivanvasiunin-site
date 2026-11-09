"""Elio's templated answers (ROADMAP 4.2, SPEC §5.1): every class, in EN / ES / RU / UK."""

import re

import pytest

from site_api.prompts.localized import TEMPLATE_LANGUAGES, load_templates, template_answer

NAMES = ("greeting", "off_topic", "injection", "rude")


@pytest.mark.parametrize("language", TEMPLATE_LANGUAGES)
def test_every_language_has_every_template(language: str) -> None:
    templates = load_templates(language)

    for name in NAMES:
        assert getattr(templates, name).strip()


@pytest.mark.parametrize("language", ["es", "ru", "uk"])
def test_each_language_has_its_own_text(language: str) -> None:
    for name in NAMES:
        assert template_answer(name, language) != template_answer(name, "en")


@pytest.mark.parametrize("language", ["de", "fr", "zh", "xx"])
def test_any_other_language_falls_back_to_english(language: str) -> None:
    assert template_answer("off_topic", language) == template_answer("off_topic", "en")


@pytest.mark.parametrize("language", TEMPLATE_LANGUAGES)
def test_the_greeting_offers_three_example_questions(language: str) -> None:
    # SPEC §5.1: a short intro of Elio + 3 example questions.
    questions = re.findall(r"^- .+\?$", template_answer("greeting", language), re.MULTILINE)

    assert len(questions) == 3


@pytest.mark.parametrize("language", TEMPLATE_LANGUAGES)
def test_elio_never_speaks_as_ivan(language: str) -> None:
    # SPEC §5.2: Elio is not Ivan. Its templates call itself Elio and Ivan by name.
    greeting = template_answer("greeting", language)

    assert "Elio" in greeting
    for phrase in ("I'm Ivan", "I am Ivan", "Soy Iván", "Я Иван", "Я Іван"):
        for name in NAMES:
            assert phrase not in template_answer(name, language)


def test_answers_end_without_a_trailing_newline() -> None:
    assert not template_answer("injection", "en").endswith("\n")
