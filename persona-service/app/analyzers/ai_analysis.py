"""
AI Analysis - Use vLLM (default) or Ollama for advanced text analysis.
Analyzes tonality, jargon, cultural assumptions, and emotional impact.
"""

import httpx
import ollama
from typing import Dict, Any, List
import json
import re

from app.config import OLLAMA_CONFIG, VLM_CONFIG, PERSONA_LLM_PROVIDER


# ---------------------------------------------------------------------------
# LLM generation helpers
# ---------------------------------------------------------------------------

def _vllm_generate(prompt: str, temperature: float = 0.3, max_tokens: int = 1024) -> str:
    """Call the vLLM OpenAI-compatible chat/completions endpoint via httpx."""
    host = (VLM_CONFIG.get("host") or "").rstrip("/")
    if not host:
        raise RuntimeError("VLM_HOST not configured for vLLM text generation")
    # Ensure the host ends with /v1 so we can append /chat/completions
    if not host.endswith("/v1"):
        host = f"{host}/v1"
    model = VLM_CONFIG.get("model") or "Qwen/Qwen3-VL-8B-Instruct-FP8"
    timeout = float(VLM_CONFIG.get("timeout", 120))

    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": float(temperature),
        "max_tokens": int(max_tokens),
    }

    resp = httpx.post(
        f"{host}/chat/completions",
        json=payload,
        headers={"Content-Type": "application/json"},
        timeout=timeout,
    )
    resp.raise_for_status()

    body = resp.json()
    return (
        (body.get("choices") or [{}])[0]
        .get("message", {})
        .get("content", "")
        .strip()
    )


def _ollama_generate(prompt: str, temperature: float = 0.3, max_tokens: int = 1024) -> str:
    """Call Ollama generate endpoint."""
    client = ollama.Client(host=OLLAMA_CONFIG["host"])
    resp = client.generate(
        model=OLLAMA_CONFIG["model"],
        prompt=prompt,
        options={"temperature": temperature, "num_predict": max_tokens},
    )
    return (resp.get("response") or "").strip()


def _generate(prompt: str, temperature: float = 0.3, max_tokens: int = 1024) -> str:
    """
    Unified LLM generation wrapper.
    Uses vLLM by default with automatic Ollama fallback.
    Set PERSONA_LLM_PROVIDER=ollama to use Ollama directly.
    """
    if PERSONA_LLM_PROVIDER == "ollama":
        return _ollama_generate(prompt, temperature=temperature, max_tokens=max_tokens)

    # vLLM first, Ollama fallback
    try:
        return _vllm_generate(prompt, temperature=temperature, max_tokens=max_tokens)
    except Exception:
        return _ollama_generate(prompt, temperature=temperature, max_tokens=max_tokens)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

async def analyze_with_ai(text: str) -> Dict[str, Any]:
    """
    Run AI-powered analysis on document text.

    Returns:
        dict with:
        - tonality: Analysis of text tone
        - jargon: Detected technical terms
        - cultural_assumptions: Cultural knowledge requirements
        - emotional_impact: Emotional assessment
        - simple_language: Simple language compliance
    """
    # Limit text length for API
    text_sample = text[:4000] if len(text) > 4000 else text

    results = {}

    try:
        # Run analyses
        results["tonality"] = await _analyze_tonality(text_sample)
        results["jargon"] = await _analyze_jargon(text_sample)
        results["cultural_assumptions"] = await _analyze_cultural(text_sample)
        results["emotional_impact"] = await _analyze_emotional(text_sample)
        results["simple_language"] = await _analyze_simple_language(text_sample)

    except Exception as e:
        results["error"] = str(e)
        results["fallback"] = True

    return results


# ---------------------------------------------------------------------------
# Individual analysis functions
# ---------------------------------------------------------------------------

async def _analyze_tonality(text: str) -> Dict[str, Any]:
    """Analyze text tonality."""
    prompt = f"""Analysiere die Tonalität dieses deutschen Textes.

Text:
{text[:2000]}

Antworte im JSON-Format:
{{
    "tone": "formal/neutral/freundlich/bedrohlich/bürokratisch",
    "formality_score": 1-10,
    "threatening_elements": ["Liste von bedrohlichen Formulierungen"],
    "positive_elements": ["Liste von positiven Formulierungen"],
    "summary": "Kurze Zusammenfassung der Tonalität"
}}

Nur JSON, keine Erklärung."""

    try:
        response = _generate(prompt)
        return _parse_json_response(response)
    except Exception as e:
        return {"error": str(e)}


async def _analyze_jargon(text: str) -> Dict[str, Any]:
    """Detect technical jargon and unexplained terms."""
    prompt = f"""Finde Fachbegriffe und Abkürzungen in diesem deutschen Text, die nicht erklärt werden.

Text:
{text[:2000]}

Antworte im JSON-Format:
{{
    "jargon_terms": [
        {{"term": "Begriff", "explanation_needed": true, "suggested_explanation": "Einfache Erklärung"}}
    ],
    "abbreviations": [
        {{"abbr": "ABK", "expanded": "Ausgeschriebene Form", "explained_in_text": false}}
    ],
    "jargon_density": "niedrig/mittel/hoch",
    "summary": "Kurze Einschätzung der Fachsprachlichkeit"
}}

Nur JSON, keine Erklärung."""

    try:
        response = _generate(prompt)
        return _parse_json_response(response)
    except Exception as e:
        return {"error": str(e)}


async def _analyze_cultural(text: str) -> Dict[str, Any]:
    """Detect cultural assumptions that might be barriers."""
    prompt = f"""Analysiere welches kulturelle Vorwissen dieser deutsche Text voraussetzt.
Denke an Menschen, die nicht in Deutschland aufgewachsen sind.

Text:
{text[:2000]}

Antworte im JSON-Format:
{{
    "assumptions": [
        {{"concept": "Konzept", "description": "Warum es Vorwissen erfordert", "suggestion": "Wie man es erklären könnte"}}
    ],
    "german_system_knowledge": ["Liste von Behörden/Systemen die vorausgesetzt werden"],
    "cultural_references": ["Kulturelle Referenzen die evtl. unbekannt sind"],
    "barrier_level": "niedrig/mittel/hoch",
    "summary": "Kurze Einschätzung"
}}

Nur JSON, keine Erklärung."""

    try:
        response = _generate(prompt)
        return _parse_json_response(response)
    except Exception as e:
        return {"error": str(e)}


async def _analyze_emotional(text: str) -> Dict[str, Any]:
    """Analyze emotional impact of text."""
    prompt = f"""Analysiere die emotionale Wirkung dieses deutschen Textes.
Wie würde sich jemand fühlen, der diesen Text liest, besonders wenn er/sie in einer schwierigen Situation ist?

Text:
{text[:2000]}

Antworte im JSON-Format:
{{
    "overall_mood": "ermutigend/neutral/belastend/bedrohlich",
    "stress_inducing_elements": ["Elemente die Stress auslösen könnten"],
    "reassuring_elements": ["Beruhigende Elemente"],
    "urgency_level": "niedrig/mittel/hoch",
    "empathy_score": 1-10,
    "summary": "Kurze emotionale Einschätzung"
}}

Nur JSON, keine Erklärung."""

    try:
        response = _generate(prompt)
        return _parse_json_response(response)
    except Exception as e:
        return {"error": str(e)}


async def _analyze_simple_language(text: str) -> Dict[str, Any]:
    """Check compliance with simple language guidelines."""
    prompt = f"""Prüfe ob dieser deutsche Text den Regeln für Leichte Sprache entspricht.

Regeln für Leichte Sprache:
- Kurze Sätze (max. 8-12 Wörter)
- Ein Gedanke pro Satz
- Keine Fremdwörter oder Erklärung dazu
- Aktive Formulierungen
- Keine Abkürzungen
- Keine Metaphern

Text:
{text[:2000]}

Antworte im JSON-Format:
{{
    "is_simple_language": true/false,
    "compliance_score": 1-10,
    "violations": [
        {{"rule": "Regel", "example": "Beispiel aus dem Text", "suggestion": "Verbesserungsvorschlag"}}
    ],
    "positive_aspects": ["Was bereits gut umgesetzt ist"],
    "summary": "Kurze Einschätzung"
}}

Nur JSON, keine Erklärung."""

    try:
        response = _generate(prompt)
        return _parse_json_response(response)
    except Exception as e:
        return {"error": str(e)}


# ---------------------------------------------------------------------------
# JSON parsing helper
# ---------------------------------------------------------------------------

def _parse_json_response(response: str) -> Dict[str, Any]:
    """Parse JSON from LLM response, handling common issues."""
    try:
        # Try direct parsing first
        return json.loads(response)
    except json.JSONDecodeError:
        pass

    # Try to extract JSON from markdown code blocks
    json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', response)
    if json_match:
        try:
            return json.loads(json_match.group(1))
        except json.JSONDecodeError:
            pass

    # Try to find JSON object in text
    json_match = re.search(r'\{[\s\S]*\}', response)
    if json_match:
        try:
            return json.loads(json_match.group(0))
        except json.JSONDecodeError:
            pass

    # Return error if parsing fails
    return {
        "error": "Could not parse AI response",
        "raw_response": response[:500],
    }
