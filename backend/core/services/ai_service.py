import json
import logging
import os
from typing import Any, Callable, Dict, List, Optional

import google.generativeai as genai

logger = logging.getLogger(__name__)

DEFAULT_MODEL = 'models/gemini-2.5-flash'
MAX_ATTEMPTS = 3
SCORE_KEYS = ('score_comfort', 'score_risk', 'score_time', 'score_pleasure')
OPTION_KEYS = ('title', 'description', 'estimated_cost', *SCORE_KEYS)


def strip_code_fences(text: str) -> str:
    text = text.strip()
    if text.startswith('```json'):
        return text.replace('```json', '').replace('```', '').strip()
    if text.startswith('```'):
        return text.replace('```', '').strip()
    return text


def _is_valid_option(option: Any) -> bool:
    if not isinstance(option, dict) or not all(key in option for key in OPTION_KEYS):
        return False
    try:
        float(option['estimated_cost'])
        return all(0 <= int(option[key]) <= 100 for key in SCORE_KEYS)
    except (ValueError, TypeError):
        return False


def validate_options(data: Any) -> bool:
    return isinstance(data, list) and len(data) == 3 and all(_is_valid_option(o) for o in data)


def validate_analysis(data: Any) -> bool:
    if not isinstance(data, dict):
        return False
    if not all(key in data for key in ('summary', 'risks', 'missing_items', 'recommendations')):
        return False
    return all(isinstance(data[key], list) for key in ('risks', 'missing_items', 'recommendations'))


def validate_suggestions(data: Any) -> bool:
    required = ('action_type', 'reason', 'impact', 'changes')
    return isinstance(data, list) and all(
        isinstance(s, dict) and all(key in s for key in required) for s in data
    )


def validate_tasks(data: Any) -> bool:
    return (
        isinstance(data, dict)
        and isinstance(data.get('tasks'), list)
        and len(data['tasks']) > 0
        and all(isinstance(t, str) and t.strip() for t in data['tasks'])
    )


def validate_project_structure(data: Any) -> bool:
    return (
        isinstance(data, dict)
        and all(key in data for key in ('title', 'description', 'nodes'))
        and isinstance(data['nodes'], list)
    )


class GeminiService:
    def __init__(self, api_key: Optional[str] = None, model_name: Optional[str] = None) -> None:
        self.api_key = api_key or os.getenv('GEMINI_API_KEY')
        self.enabled = bool(self.api_key)
        self.model: Optional[genai.GenerativeModel] = None

        if self.enabled:
            genai.configure(api_key=self.api_key)
            self.model = genai.GenerativeModel(model_name or os.getenv('GEMINI_MODEL', DEFAULT_MODEL))

    def _generate_text(self, prompt: str, label: str) -> Optional[str]:
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                return self.model.generate_content(prompt).text.strip()
            except Exception:
                logger.exception('Gemini call failed in %s (attempt %d/%d)', label, attempt, MAX_ATTEMPTS)
        return None

    def _generate_json(self, prompt: str, validator: Callable[[Any], bool], label: str) -> Optional[Any]:
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                response_text = strip_code_fences(self.model.generate_content(prompt).text)
                data = json.loads(response_text)
            except json.JSONDecodeError as e:
                logger.warning('Invalid JSON in %s (attempt %d/%d): %s', label, attempt, MAX_ATTEMPTS, e)
                continue
            except Exception:
                logger.exception('Gemini call failed in %s (attempt %d/%d)', label, attempt, MAX_ATTEMPTS)
                continue
            if validator(data):
                return data
            logger.warning('Schema validation failed in %s (attempt %d/%d)', label, attempt, MAX_ATTEMPTS)
        return None

    def generate_options(
        self,
        parent_node_text: str,
        project_context: str,
        budget_context: str
    ) -> Optional[List[Dict[str, Any]]]:
        if not self.enabled:
            return None

        prompt = f"""You are a decision planning assistant. Given a parent decision node, suggest 3 concrete sub-options that would be logical next steps.

Parent Node: {parent_node_text}
Project Context: {project_context}
Budget Context: {budget_context}

Generate exactly 3 sub-options. Each option must be realistic, specific, and consider the budget constraints.

For each option, provide multi-dimensional scores (0-100):
- score_comfort: How comfortable/convenient is this option? (0=very uncomfortable, 100=very comfortable)
- score_risk: Risk level (0=very safe, 100=very risky)
- score_time: Time efficiency (0=very slow, 100=very fast)
- score_pleasure: Satisfaction/pleasure level (0=no pleasure, 100=maximum pleasure)

Return a JSON array with this exact structure:
[
  {{
    "title": "Option 1 Title",
    "description": "Brief description of option 1",
    "estimated_cost": "1234.56",
    "score_comfort": 75,
    "score_risk": 30,
    "score_time": 60,
    "score_pleasure": 80
  }},
  {{
    "title": "Option 2 Title",
    "description": "Brief description of option 2",
    "estimated_cost": "2345.67",
    "score_comfort": 60,
    "score_risk": 50,
    "score_time": 70,
    "score_pleasure": 65
  }},
  {{
    "title": "Option 3 Title",
    "description": "Brief description of option 3",
    "estimated_cost": "3456.78",
    "score_comfort": 85,
    "score_risk": 20,
    "score_time": 50,
    "score_pleasure": 90
  }}
]

Important:
- estimated_cost must be a string with 2 decimal places
- All scores must be integers between 0 and 100
- estimated_cost should be realistic and consider the budget context
- Titles should be concise (max 50 characters)
- Descriptions should be brief (max 200 characters)
"""
        return self._generate_json(prompt, validate_options, 'generate_options')

    def analyze_project(
        self,
        project_title: str,
        project_description: str,
        budget_total: float,
        tree_summary: str
    ) -> Optional[Dict[str, Any]]:
        """Return a strategic analysis: summary, risks, missing items and recommendations."""
        if not self.enabled:
            return None

        prompt = f"""Jesteś ekspertem od zarządzania projektami i planowania budżetu. 
Przeanalizuj poniższe drzewo decyzji dla projektu, zwracając szczególną uwagę na wielowymiarowe oceny (scores).

{tree_summary}

WAŻNE - Analiza Scores:
- Comfort (0-100): Wygoda/komfort opcji
- Risk (0-100): Poziom ryzyka (NIŻSZY = LEPSZY)
- Time (0-100): Efektywność czasowa (WYŻSZY = SZYBSZY)
- Pleasure/Joy (0-100): Satysfakcja/przyjemność

Twoim zadaniem jest:
1. Podsumować projekt w 2-3 zdaniach, uwzględniając średnie scores
2. Zidentyfikować potencjalne ryzyka (np. przekroczenie budżetu, niskie scores, brakujące elementy)
3. Znaleźć brakujące elementy, które powinny być uwzględnione
4. Zaproponować 3 konkretne, strategiczne rady BAZUJĄC NA SCORES

PRZYKŁAD ANALIZY SCORES:
- Jeśli średni Comfort < 50: "Opcje są niewygodne, rozważ bardziej komfortowe rozwiązania"
- Jeśli średni Risk > 70: "Wysoki poziom ryzyka w projekcie, dodaj opcje bezpieczniejsze"
- Jeśli średni Time < 40: "Projekt będzie czasochłonny, rozważ szybsze alternatywy"
- Jeśli średni Pleasure < 50: "Niska satysfakcja, dodaj elementy zwiększające radość"

Odpowiedz TYLKO w formacie JSON (bez markdown, bez code blocks):
{{
  "summary": "Krótkie podsumowanie projektu uwzględniające średnie scores (2-3 zdania)",
  "risks": [
    "Ryzyko 1: opis uwzględniający scores",
    "Ryzyko 2: opis uwzględniający scores",
    "Ryzyko 3: opis uwzględniający scores"
  ],
  "missing_items": [
    "Brakujący element 1",
    "Brakujący element 2",
    "Brakujący element 3"
  ],
  "recommendations": [
    "Rekomendacja 1: konkretna rada bazująca na scores",
    "Rekomendacja 2: konkretna rada bazująca na scores",
    "Rekomendacja 3: konkretna rada bazująca na scores"
  ]
}}

Ważne:
- Odpowiedzi w języku polskim
- Konkretne i praktyczne rady BAZUJĄCE NA SCORES
- Uwzględnij budżet, strukturę drzewa I SCORES
- Każda lista powinna mieć 3 elementy
- Używaj konkretnych liczb ze scores w analizie
"""
        return self._generate_json(prompt, validate_analysis, 'analyze_project')

    def generate_actionable_suggestions(
        self,
        project_title: str,
        project_description: str,
        budget_total: float,
        tree_summary: str
    ) -> Optional[List[Dict[str, Any]]]:
        """Return machine-applicable change proposals for the decision tree."""
        if not self.enabled:
            return None

        prompt = f"""Jesteś ekspertem od zarządzania projektami. Przeanalizuj poniższe drzewo decyzji i zaproponuj KONKRETNE ZMIANY, które użytkownik może zatwierdzić jednym kliknięciem.

{tree_summary}

Twoim zadaniem jest zaproponować 3-5 KONKRETNYCH ZMIAN, które poprawią projekt. Każda zmiana musi być:
1. KONKRETNA - dokładnie określ co zmienić (np. "Zmień status węzła 'Catering' na 'selected'")
2. UZASADNIONA - wyjaśnij dlaczego ta zmiana jest dobra
3. WYKONALNA - możliwa do zastosowania automatycznie

TYPY ZMIAN:
- "update_node_status": Zmień status węzła (pending/selected/rejected)
- "update_node_scores": Zaktualizuj scores węzła (comfort/risk/time/pleasure)
- "update_node_cost": Zaktualizuj koszt węzła
- "add_buffer_node": Dodaj nowy węzeł bufora bezpieczeństwa

PRZYKŁADY DOBRYCH PROPOZYCJI:
- "Zmień status węzła 'Opcja A' na 'selected' - ma najlepsze scores (avg: 85)"
- "Dodaj bufor 15% budżetu jako węzeł 'Rezerwa' - zabezpieczenie przed przekroczeniem"
- "Odrzuć węzeł 'Opcja C' (status: rejected) - zbyt wysokie ryzyko (risk: 90)"

Odpowiedz TYLKO w formacie JSON (bez markdown):
[
  {{
    "action_type": "update_node_status",
    "node_title": "Nazwa węzła do zmiany",
    "node_id": null,
    "changes": {{
      "status": "selected"
    }},
    "reason": "Dlaczego ta zmiana jest dobra (1-2 zdania)",
    "impact": "Jaki będzie efekt tej zmiany"
  }},
  {{
    "action_type": "add_buffer_node",
    "parent_title": "Nazwa węzła rodzica",
    "parent_id": null,
    "changes": {{
      "title": "Rezerwa budżetowa",
      "description": "Bufor na nieprzewidziane wydatki",
      "estimated_cost": "1500.00",
      "score_comfort": 80,
      "score_risk": 20,
      "score_time": 90,
      "score_pleasure": 60
    }},
    "reason": "Dlaczego ta zmiana jest dobra",
    "impact": "Jaki będzie efekt"
  }}
]

WAŻNE:
- Odpowiedzi w języku polskim
- node_id i parent_id zawsze null (backend dopasuje po tytule)
- Każda propozycja musi mieć: action_type, reason, impact
- Maksymalnie 5 propozycji
- Bazuj na rzeczywistych danych z tree_summary
"""
        return self._generate_json(prompt, validate_suggestions, 'generate_actionable_suggestions')

    def chat_with_project(
        self,
        project_title: str,
        project_description: str,
        budget_total: float,
        tree_summary: str,
        chat_history: str,
        user_message: str
    ) -> Optional[str]:
        """Free-form assistant reply grounded in the project tree and recent chat history."""
        if not self.enabled:
            return None

        prompt = f"""Jesteś AI asystentem pomagającym w zarządzaniu projektem decyzyjnym.

KONTEKST PROJEKTU:
{tree_summary}

HISTORIA ROZMOWY:
{chat_history}

AKTUALNA WIADOMOŚĆ UŻYTKOWNIKA:
{user_message}

Twoim zadaniem jest pomóc użytkownikowi w zarządzaniu projektem. Możesz:
1. Odpowiadać na pytania o projekt
2. Sugerować zmiany (np. "dodaj sekcję transport", "ustaw budżet X dla węzła Y")
3. Analizować dane i dawać rady
4. Pomagać w organizacji chronologicznej

WAŻNE INFORMACJE O SEKCJACH:
- Dostępne sekcje: general, transport, accommodation, food, entertainment, activities, services, equipment, other
- Każdy węzeł może mieć przypisaną sekcję (section)
- Każdy węzeł może mieć kolejność chronologiczną (order: 0 = pierwszy, wyższe = później)

PRZYKŁADY ODPOWIEDZI:
User: "Dodaj sekcję transport z budżetem 500"
AI: "Rozumiem! Sugeruję utworzenie węzła 'Transport' z następującymi parametrami:
- Tytuł: Transport
- Sekcja: transport
- Budżet: $500
- Order: 0 (jako pierwszy etap)

Czy chcesz, żebym dodał konkretne opcje transportu (np. samochód, pociąg, samolot)?"

User: "Jak wygląda chronologia mojego projektu?"
AI: "Na podstawie pola 'order' w węzłach, chronologia wygląda następująco:
1. [Order 0] Transport - $500
2. [Order 1] Zakwaterowanie - $1000
3. [Order 2] Atrakcje - $800

Czy chcesz zmienić kolejność któregoś z etapów?"

Odpowiedz w języku polskim, konkretnie i pomocnie. Jeśli użytkownik prosi o dodanie czegoś, zasugeruj konkretne parametry (tytuł, sekcję, budżet, order).
"""
        return self._generate_text(prompt, 'chat_with_project')

    def build_project_from_notes(
        self,
        notes: str,
        budget_total: float
    ) -> Optional[Dict[str, Any]]:
        """Generate a full project (title, description, nested nodes) from free-text notes."""
        if not self.enabled:
            return None

        prompt = f"""Jesteś ekspertem od planowania projektów. Na podstawie notatek użytkownika, stwórz kompletną strukturę projektu.

NOTATKI UŻYTKOWNIKA:
{notes}

BUDŻET: ${budget_total}

Twoim zadaniem jest stworzyć strukturę projektu z:
1. Tytuł projektu (krótki, opisowy)
2. Opis projektu (2-3 zdania)
3. Drzewo węzłów decyzyjnych z sekcjami i chronologią

WAŻNE ZASADY:
- Każdy węzeł musi mieć: title, description, estimated_cost, section, order
- Sekcje: general, transport, accommodation, food, entertainment, activities, services, equipment, other
- Order: 0 = pierwszy etap, 1 = drugi, etc. (chronologicznie)
- Suma kosztów nie powinna przekraczać budżetu
- Stwórz hierarchię: główne węzły (root) i ich opcje (children)
- Każdy węzeł powinien mieć scores (comfort, risk, time, pleasure) 0-100

PRZYKŁAD STRUKTURY:
{{
  "title": "Wieczór Panieński",
  "description": "Organizacja wieczoru panieńskiego dla 10 osób z budżetem $5000",
  "nodes": [
    {{
      "title": "Transport",
      "description": "Dojazd na miejsce i powrót",
      "estimated_cost": "500",
      "section": "transport",
      "order": 0,
      "score_comfort": 70,
      "score_risk": 30,
      "score_time": 80,
      "score_pleasure": 60,
      "children": [
        {{
          "title": "Wynajem busa",
          "description": "Bus dla 10 osób z kierowcą",
          "estimated_cost": "400",
          "section": "transport",
          "order": 0,
          "score_comfort": 80,
          "score_risk": 20,
          "score_time": 90,
          "score_pleasure": 70,
          "children": []
        }},
        {{
          "title": "Samochody prywatne",
          "description": "3 samochody, paliwo",
          "estimated_cost": "150",
          "section": "transport",
          "order": 0,
          "score_comfort": 60,
          "score_risk": 40,
          "score_time": 70,
          "score_pleasure": 50,
          "children": []
        }}
      ]
    }},
    {{
      "title": "Zakwaterowanie",
      "description": "Nocleg dla grupy",
      "estimated_cost": "1200",
      "section": "accommodation",
      "order": 1,
      "score_comfort": 80,
      "score_risk": 20,
      "score_time": 60,
      "score_pleasure": 75,
      "children": [...]
    }}
  ]
}}

Odpowiedz TYLKO w formacie JSON (bez markdown, bez code blocks).
Stwórz kompletną strukturę z minimum 3-5 głównych węzłów i opcjami dla każdego.
"""
        return self._generate_json(prompt, validate_project_structure, 'build_project_from_notes')

    def generate_tasks_for_node(self, node_title: str, node_description: str) -> Optional[List[str]]:
        """Break a selected decision down into 3-5 actionable tasks."""
        if not self.enabled:
            return None

        prompt = f"""Podano wybraną decyzję w projekcie:
Tytuł: {node_title}
Opis: {node_description}

Wygeneruj krótką, logiczną listę kroków (3-5 zadań), które trzeba wykonać, aby zrealizować tę decyzję.
Zadania powinny być konkretne, wykonywalne i w logicznej kolejności.

Zwróć TYLKO czysty JSON w formacie:
{{"tasks": ["zadanie 1", "zadanie 2", "zadanie 3"]}}

Nie dodawaj żadnych dodatkowych komentarzy ani formatowania."""

        data = self._generate_json(prompt, validate_tasks, 'generate_tasks_for_node')
        return data['tasks'][:5] if data else None


ai_service = GeminiService()
