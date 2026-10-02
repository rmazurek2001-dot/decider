from typing import Any, Dict, List, Optional, Tuple

SUPPORTED_LANGUAGES = ('en', 'pl')
DEFAULT_LANGUAGE = 'en'

Text = Dict[str, Tuple[str, str]]


def _milestone(section: str, order: int, text: Text, children: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        'text': text,
        'node_type': 'milestone',
        'section': section,
        'order': order,
        'estimated_cost_percent': 0,
        'children': [{**child, 'section': section, 'order': order} for child in children],
    }


def _option(cost_percent: int, scores: Tuple[int, int, int, int], text: Text) -> Dict[str, Any]:
    comfort, risk, time, pleasure = scores
    return {
        'text': text,
        'node_type': 'decision',
        'estimated_cost_percent': cost_percent,
        'score_comfort': comfort,
        'score_risk': risk,
        'score_time': time,
        'score_pleasure': pleasure,
    }


TEMPLATES: Dict[str, Dict[str, Any]] = {
    'wedding': {
        'icon': 'heart',
        'text': {
            'en': ('Wedding Planning', 'End-to-end wedding plan covering the key decisions'),
            'pl': ('Organizacja Wesela', 'Kompleksowy plan organizacji wesela z kluczowymi decyzjami'),
        },
        'nodes': [
            _milestone('accommodation', 0, {
                'en': ('Reception Venue', 'Where the wedding reception will be held'),
                'pl': ('Wybór Sali Weselnej', 'Miejsce przyjęcia weselnego'),
            }, [
                _option(35, (85, 20, 70, 80), {
                    'en': ('Hotel Ballroom (200 guests)', 'Elegant hotel ballroom with full on-site services'),
                    'pl': ('Sala w Hotelu (200 osób)', 'Elegancka sala hotelowa z pełnym zapleczem'),
                }),
                _option(25, (75, 30, 60, 75), {
                    'en': ('Restaurant Venue (150 guests)', 'Intimate restaurant with a private garden'),
                    'pl': ('Sala w Restauracji (150 osób)', 'Kameralna restauracja z ogródkiem'),
                }),
                _option(20, (60, 60, 50, 85), {
                    'en': ('Outdoor Marquee (100 guests)', 'Open-air celebration in an event tent'),
                    'pl': ('Plenerowa Sala (100 osób)', 'Wesele w plenerze, namiot eventowy'),
                }),
            ]),
            _milestone('entertainment', 1, {
                'en': ('Music & Entertainment', 'Music and entertainment for the reception'),
                'pl': ('Oprawa Muzyczna', 'Muzyka i rozrywka na weselu'),
            }, [
                _option(15, (80, 25, 75, 85), {
                    'en': ('Live Wedding Band (5 musicians)', 'Professional band with a lead vocalist'),
                    'pl': ('Zespół Weselny (5 osób)', 'Profesjonalny zespół z wokalistką'),
                }),
                _option(10, (75, 20, 80, 80), {
                    'en': ('DJ + MC', 'DJ with professional sound gear and a master of ceremonies'),
                    'pl': ('DJ + Wodzirej', 'DJ z profesjonalnym sprzętem i wodzirej'),
                }),
            ]),
            _milestone('food', 2, {
                'en': ('Catering & Menu', 'Food and drinks for the guests'),
                'pl': ('Catering i Menu', 'Jedzenie i napoje dla gości'),
            }, [
                _option(30, (90, 15, 65, 90), {
                    'en': ('Premium Menu (5 courses)', 'Fine-dining menu with wine pairing'),
                    'pl': ('Menu Premium (5 dań)', 'Wykwintne menu z degustacją win'),
                }),
                _option(20, (75, 20, 70, 75), {
                    'en': ('Standard Menu (3 courses)', 'Classic three-course wedding dinner'),
                    'pl': ('Menu Standard (3 dania)', 'Klasyczne menu weselne'),
                }),
            ]),
        ],
    },
    'vacation': {
        'icon': 'plane',
        'text': {
            'en': ('Vacation Trip', 'Planning your dream holiday from travel to activities'),
            'pl': ('Wyjazd na Wakacje', 'Planowanie wymarzonego wyjazdu wakacyjnego'),
        },
        'nodes': [
            _milestone('transport', 0, {
                'en': ('Transport', 'How you will get to the destination'),
                'pl': ('Transport', 'Sposób dotarcia na miejsce'),
            }, [
                _option(30, (85, 25, 90, 80), {
                    'en': ('Direct Flight', 'Nonstop flight, fast and comfortable'),
                    'pl': ('Samolot (bezpośredni)', 'Lot bezpośredni, szybko i wygodnie'),
                }),
                _option(15, (70, 40, 50, 75), {
                    'en': ('Road Trip (own car)', 'Drive your own car for maximum flexibility'),
                    'pl': ('Samochód (własny)', 'Podróż własnym autem, elastyczność'),
                }),
                _option(20, (75, 20, 60, 70), {
                    'en': ('Train', 'Relaxed rail journey with views along the way'),
                    'pl': ('Pociąg', 'Podróż koleją, widoki za oknem'),
                }),
            ]),
            _milestone('accommodation', 1, {
                'en': ('Accommodation', 'Where you will stay'),
                'pl': ('Nocleg', 'Miejsce zakwaterowania'),
            }, [
                _option(40, (95, 10, 85, 90), {
                    'en': ('5-Star Resort (All Inclusive)', 'Luxury hotel with all meals included'),
                    'pl': ('Hotel 5* (All Inclusive)', 'Luksusowy hotel z pełnym wyżywieniem'),
                }),
                _option(25, (80, 30, 70, 80), {
                    'en': ('Apartment Rental (Airbnb)', 'Private apartment with its own kitchen'),
                    'pl': ('Apartament (Airbnb)', 'Prywatny apartament, własna kuchnia'),
                }),
                _option(10, (55, 35, 65, 65), {
                    'en': ('Hostel', 'Budget-friendly stay with a social atmosphere'),
                    'pl': ('Hostel', 'Ekonomiczne zakwaterowanie, atmosfera'),
                }),
            ]),
            _milestone('activities', 2, {
                'en': ('Activities', 'Sightseeing and things to do'),
                'pl': ('Atrakcje', 'Aktywności i zwiedzanie'),
            }, [
                _option(20, (85, 15, 75, 85), {
                    'en': ('Guided Tour Package', 'Bundle of excursions with a local guide'),
                    'pl': ('Wycieczki Zorganizowane', 'Pakiet wycieczek z przewodnikiem'),
                }),
                _option(10, (70, 40, 60, 80), {
                    'en': ('Self-Guided Exploring', 'Discover the area at your own pace'),
                    'pl': ('Zwiedzanie na Własną Rękę', 'Samodzielne odkrywanie okolicy'),
                }),
            ]),
        ],
    },
    'renovation': {
        'icon': 'hammer',
        'text': {
            'en': ('Apartment Renovation', 'Complete plan for renovating an apartment'),
            'pl': ('Remont Mieszkania', 'Kompleksowy plan remontu mieszkania'),
        },
        'nodes': [
            _milestone('services', 0, {
                'en': ('Renovation Crew', 'Who will carry out the work'),
                'pl': ('Wybór Ekipy Remontowej', 'Kto wykona prace remontowe'),
            }, [
                _option(40, (90, 15, 80, 85), {
                    'en': ('General Contractor', 'Established construction company with a warranty'),
                    'pl': ('Profesjonalna Firma Budowlana', 'Doświadczona firma z gwarancją'),
                }),
                _option(25, (70, 40, 60, 70), {
                    'en': ('Independent Tradespeople', 'Vetted individual tradespeople at a lower price'),
                    'pl': ('Samodzielni Fachowcy', 'Sprawdzeni rzemieślnicy, niższa cena'),
                }),
                _option(10, (50, 70, 40, 60), {
                    'en': ('DIY with Friends', 'Your own labor plus help from friends'),
                    'pl': ('Remont Systemem Gospodarczym', 'Własna praca + pomoc znajomych'),
                }),
            ]),
            _milestone('equipment', 1, {
                'en': ('Finishing Materials', 'Tiles, flooring and paint'),
                'pl': ('Materiały Wykończeniowe', 'Płytki, panele, farby'),
            }, [
                _option(30, (90, 10, 75, 90), {
                    'en': ('Premium Materials', 'Top quality from well-known brands'),
                    'pl': ('Materiały Premium', 'Najwyższa jakość, renomowane marki'),
                }),
                _option(20, (75, 25, 70, 75), {
                    'en': ('Mid-Range Materials', 'Good balance of quality and price'),
                    'pl': ('Materiały Średniej Klasy', 'Dobry stosunek jakości do ceny'),
                }),
            ]),
            _milestone('equipment', 2, {
                'en': ('Furniture & Fixtures', 'Kitchen and bathroom cabinets, wardrobes'),
                'pl': ('Meble i Wyposażenie', 'Meble kuchenne, łazienkowe, szafy'),
            }, [
                _option(25, (95, 20, 60, 90), {
                    'en': ('Custom-Made Furniture', 'Designed and built to measure'),
                    'pl': ('Meble na Wymiar', 'Projektowane indywidualnie'),
                }),
                _option(15, (75, 15, 85, 70), {
                    'en': ('Modular Furniture (IKEA)', 'Ready-made units with quick assembly'),
                    'pl': ('Meble Modułowe (IKEA)', 'Gotowe rozwiązania, szybki montaż'),
                }),
            ]),
        ],
    },
}


def _resolve_language(language: Optional[str]) -> str:
    return language if language in SUPPORTED_LANGUAGES else DEFAULT_LANGUAGE


def _localize_node(node: Dict[str, Any], language: str) -> Dict[str, Any]:
    title, description = node['text'][language]
    localized = {key: value for key, value in node.items() if key not in ('text', 'children')}
    localized.update(title=title, description=description)
    if 'children' in node:
        localized['children'] = [_localize_node(child, language) for child in node['children']]
    return localized


def get_all_templates(language: str = DEFAULT_LANGUAGE) -> List[Dict[str, Any]]:
    """List available templates without their node trees."""
    language = _resolve_language(language)
    return [
        {
            'id': template_id,
            'title': template['text'][language][0],
            'description': template['text'][language][1],
            'icon': template['icon'],
        }
        for template_id, template in TEMPLATES.items()
    ]


def get_template(template_id: str, language: str = DEFAULT_LANGUAGE) -> Optional[Dict[str, Any]]:
    """Return a full localized template with nested nodes, or None for an unknown id."""
    template = TEMPLATES.get(template_id)
    if template is None:
        return None
    language = _resolve_language(language)
    title, description = template['text'][language]
    return {
        'title': title,
        'description': description,
        'icon': template['icon'],
        'nodes': [_localize_node(node, language) for node in template['nodes']],
    }
