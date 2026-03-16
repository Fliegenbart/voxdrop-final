"""
Report Generator - Generate persona-based accessibility reports.
Maps analysis results to individual personas and generates recommendations.
"""

from typing import Dict, Any, List
from datetime import datetime

from app.config import PERSONAS, PersonaDefinition


def generate_report(
    filename: str,
    document_data: Dict[str, Any],
    analysis_results: Dict[str, Any],
    personas: Dict[str, PersonaDefinition]
) -> Dict[str, Any]:
    """
    Generate a comprehensive persona-based accessibility report.

    Args:
        filename: Original document filename
        document_data: Parsed document data
        analysis_results: Results from all analyzers
        personas: Persona definitions

    Returns:
        Complete report with persona assessments and recommendations
    """
    # Evaluate each persona
    persona_results = []
    for persona_id, persona in personas.items():
        evaluation = _evaluate_persona(persona, analysis_results, document_data)
        persona_results.append(evaluation)

    # Calculate summary
    accessible_count = sum(1 for p in persona_results if p["status"] == "accessible")
    limited_count = sum(1 for p in persona_results if p["status"] == "limited")
    blocked_count = sum(1 for p in persona_results if p["status"] == "blocked")

    # Generate prioritized recommendations
    recommendations = _generate_recommendations(persona_results, analysis_results)

    # Compile all issues
    all_issues = _compile_all_issues(analysis_results)

    return {
        "document": filename,
        "format": document_data.get("format", "unknown"),
        "analyzed_at": datetime.utcnow().isoformat(),
        "summary": {
            "accessible": accessible_count,
            "limited": limited_count,
            "blocked": blocked_count,
            "total": len(personas),
            "accessibility_percentage": round(
                (accessible_count + limited_count * 0.5) / len(personas) * 100
            ),
        },
        "personas": persona_results,
        "recommendations": recommendations,
        "detailed_analysis": {
            "readability": analysis_results.get("readability", {}),
            "structure": analysis_results.get("structure", {}),
            "colors": analysis_results.get("colors", {}),
            "accessibility": analysis_results.get("accessibility", {}),
            "ai": analysis_results.get("ai", {}),
        },
        "all_issues": all_issues,
        "document_stats": {
            "page_count": document_data.get("page_count", document_data.get("slide_count", 0)),
            "word_count": analysis_results.get("readability", {}).get("word_count", 0),
            "image_count": document_data.get("image_count", 0),
            "heading_count": len(document_data.get("headings", [])),
        },
    }


def _evaluate_persona(
    persona: PersonaDefinition,
    analysis_results: Dict[str, Any],
    document_data: Dict[str, Any]
) -> Dict[str, Any]:
    """Evaluate document accessibility for a specific persona."""
    issues = []
    critical_issues = 0
    warning_issues = 0

    # Check each relevant test for this persona
    for test in persona.relevant_tests:
        test_issues = _check_test_for_persona(test, persona, analysis_results, document_data)
        issues.extend(test_issues)

        for issue in test_issues:
            if issue.get("severity") == "critical":
                critical_issues += 1
            elif issue.get("severity") == "warning":
                warning_issues += 1

    # Determine overall status
    if critical_issues >= 2:
        status = "blocked"
    elif critical_issues == 1 or warning_issues >= 3:
        status = "limited"
    else:
        status = "accessible"

    return {
        "id": persona.id,
        "name": f"{persona.name} ({persona.age})",
        "icon": persona.icon,
        "description": persona.description,
        "core_limitation": persona.core_limitation,
        "status": status,
        "critical_issues": critical_issues,
        "warning_issues": warning_issues,
        "issues": issues,
        "friction_points": persona.friction_points,
    }


def _check_test_for_persona(
    test: str,
    persona: PersonaDefinition,
    analysis_results: Dict[str, Any],
    document_data: Dict[str, Any]
) -> List[Dict[str, Any]]:
    """Run a specific test and return issues relevant to persona."""
    issues = []

    if test == "contrast":
        color_analysis = analysis_results.get("colors", {})
        if not color_analysis.get("wcag_aa_compliant", True):
            issues.append({
                "type": "contrast",
                "severity": "critical",
                "description": "Kontrast entspricht nicht WCAG AA (min. 4.5:1)",
                "recommendation": "Farbkontrast erhöhen",
                "persona_impact": f"{persona.name} kann Inhalte möglicherweise nicht lesen",
            })

    elif test == "font_size":
        font_analysis = analysis_results.get("accessibility", {}).get("font_analysis", {})
        min_size = font_analysis.get("min_size", 12)
        if min_size < 12:
            issues.append({
                "type": "font_size",
                "severity": "critical" if min_size < 10 else "warning",
                "description": f"Kleinste Schriftgröße: {min_size}pt (empfohlen: min. 12pt)",
                "recommendation": "Schriftgröße auf mindestens 12pt erhöhen",
                "persona_impact": f"{persona.name} kann kleine Schrift schwer lesen",
            })

    elif test == "alt_texts":
        image_analysis = analysis_results.get("accessibility", {}).get("image_analysis", {})
        coverage = image_analysis.get("coverage", 100)
        if coverage < 100:
            missing = image_analysis.get("total", 0) - image_analysis.get("with_alt_text", 0)
            issues.append({
                "type": "alt_texts",
                "severity": "critical" if coverage < 50 else "warning",
                "description": f"{missing} Bilder ohne Alternativtext",
                "recommendation": "Beschreibende Alternativtexte hinzufügen",
                "persona_impact": f"{persona.name} verpasst visuelle Informationen",
            })

    elif test == "readability":
        readability = analysis_results.get("readability", {})
        flesch = readability.get("flesch_reading_ease", 50)
        if flesch < 50:
            issues.append({
                "type": "readability",
                "severity": "critical" if flesch < 30 else "warning",
                "description": f"Flesch-Index: {flesch} (schwer verständlich)",
                "recommendation": "Kürzere Sätze und einfachere Wörter verwenden",
                "persona_impact": f"{persona.name} wird den Text schwer verstehen",
            })

    elif test == "sentence_length":
        readability = analysis_results.get("readability", {})
        avg_length = readability.get("avg_sentence_length", 15)
        if avg_length > 20:
            issues.append({
                "type": "sentence_length",
                "severity": "critical" if avg_length > 25 else "warning",
                "description": f"Ø Satzlänge: {avg_length:.0f} Wörter (empfohlen: max. 15-20)",
                "recommendation": "Sätze kürzen und aufteilen",
                "persona_impact": f"{persona.name} verliert bei langen Sätzen den Faden",
            })

    elif test == "jargon":
        ai_analysis = analysis_results.get("ai", {})
        jargon = ai_analysis.get("jargon", {})
        if jargon.get("jargon_density") in ["mittel", "hoch"]:
            terms = jargon.get("jargon_terms", [])
            issues.append({
                "type": "jargon",
                "severity": "warning" if jargon.get("jargon_density") == "mittel" else "critical",
                "description": f"{len(terms)} Fachbegriffe ohne Erklärung",
                "recommendation": "Fachbegriffe erklären oder vermeiden",
                "persona_impact": f"{persona.name} kennt diese Begriffe möglicherweise nicht",
                "examples": [t.get("term") for t in terms[:5]],
            })

    elif test == "structure":
        structure = analysis_results.get("structure", {})
        if structure.get("heading_count", 0) == 0:
            issues.append({
                "type": "structure",
                "severity": "critical",
                "description": "Keine Überschriften vorhanden",
                "recommendation": "Klare Überschriften-Hierarchie hinzufügen",
                "persona_impact": f"{persona.name} kann sich im Dokument nicht orientieren",
            })

    elif test == "paragraph_length":
        structure = analysis_results.get("structure", {})
        para_stats = structure.get("paragraph_stats", {})
        if para_stats.get("max_length", 0) > 100:
            issues.append({
                "type": "paragraph_length",
                "severity": "warning",
                "description": "Sehr lange Absätze (100+ Wörter)",
                "recommendation": "Absätze kürzen, Zwischenüberschriften einfügen",
                "persona_impact": f"{persona.name} verliert bei langen Textblöcken die Konzentration",
            })

    elif test == "tonality":
        ai_analysis = analysis_results.get("ai", {})
        tonality = ai_analysis.get("tonality", {})
        tone = tonality.get("tone", "neutral")
        if tone in ["bedrohlich", "bürokratisch"]:
            issues.append({
                "type": "tonality",
                "severity": "warning" if tone == "bürokratisch" else "critical",
                "description": f"Tonalität: {tone}",
                "recommendation": "Freundlicheren, einladenderen Ton verwenden",
                "persona_impact": f"{persona.name} fühlt sich durch den Ton eingeschüchtert",
                "examples": tonality.get("threatening_elements", [])[:3],
            })

    elif test == "simple_language":
        ai_analysis = analysis_results.get("ai", {})
        simple = ai_analysis.get("simple_language", {})
        if not simple.get("is_simple_language", False):
            issues.append({
                "type": "simple_language",
                "severity": "critical",
                "description": "Text nicht in Leichter Sprache",
                "recommendation": "Version in Leichter Sprache bereitstellen",
                "persona_impact": f"{persona.name} kann den Text nicht verstehen",
            })

    elif test == "color_only":
        color_analysis = analysis_results.get("colors", {})
        if color_analysis.get("similar_colors"):
            issues.append({
                "type": "color_only",
                "severity": "warning",
                "description": "Information möglicherweise nur durch Farbe vermittelt",
                "recommendation": "Zusätzliche visuelle Unterscheidung verwenden",
                "persona_impact": f"{persona.name} kann Farben nicht unterscheiden",
            })

    elif test == "passive_voice":
        passive_analysis = analysis_results.get("passive_voice", {})
        passive_ratio = passive_analysis.get("passive_ratio", 0)
        passive_count = passive_analysis.get("passive_count", 0)

        if passive_ratio > 0.30:
            issues.append({
                "type": "passive_voice",
                "severity": "critical",
                "description": f"{int(passive_ratio*100)}% Passiv-Sätze ({passive_count} Sätze)",
                "recommendation": "Sätze im Aktiv formulieren: Wer macht was?",
                "persona_impact": f"{persona.name} hat Schwierigkeiten, Passiv-Konstruktionen zu verstehen",
                "examples": [s.get("text") for s in passive_analysis.get("passive_sentences", [])[:3]],
            })
        elif passive_ratio > 0.20:
            issues.append({
                "type": "passive_voice",
                "severity": "warning",
                "description": f"{int(passive_ratio*100)}% Passiv-Sätze ({passive_count} Sätze)",
                "recommendation": "Mehr Aktiv-Formulierungen verwenden",
                "persona_impact": f"{persona.name} braucht klare Subjekt-Verb-Objekt-Struktur",
                "examples": [s.get("text") for s in passive_analysis.get("passive_sentences", [])[:2]],
            })
        elif passive_count > 2:
            # Mehr als 2 Passiv-Sätze, aber unter 20%
            issues.append({
                "type": "passive_voice",
                "severity": "info",
                "description": f"{passive_count} Passiv-Konstruktionen gefunden",
                "recommendation": "Prüfen Sie, ob Aktiv-Formulierungen möglich sind",
                "persona_impact": f"Aktiv-Sätze sind für {persona.name} leichter verständlich",
            })

    return issues


def _generate_recommendations(
    persona_results: List[Dict],
    analysis_results: Dict[str, Any]
) -> List[Dict[str, Any]]:
    """Generate prioritized recommendations based on impact."""
    # Collect all issues and count affected personas
    issue_impact = {}

    for persona in persona_results:
        for issue in persona.get("issues", []):
            issue_type = issue.get("type")
            if issue_type not in issue_impact:
                issue_impact[issue_type] = {
                    "type": issue_type,
                    "description": issue.get("description"),
                    "recommendation": issue.get("recommendation"),
                    "severity": issue.get("severity"),
                    "affected_personas": [],
                }
            issue_impact[issue_type]["affected_personas"].append(persona["id"])

    # Convert to list and sort by impact
    recommendations = []
    for issue_type, data in issue_impact.items():
        affected_count = len(set(data["affected_personas"]))
        severity_score = {"critical": 3, "warning": 2, "info": 1}.get(data["severity"], 1)

        recommendations.append({
            "action": data["recommendation"],
            "issue": data["description"],
            "type": issue_type,
            "severity": data["severity"],
            "impact": affected_count,
            "affected_personas": list(set(data["affected_personas"])),
            "priority_score": affected_count * severity_score,
            "effort": _estimate_effort(issue_type),
        })

    # Sort by priority score (descending)
    recommendations.sort(key=lambda x: x["priority_score"], reverse=True)

    # Add priority ranking
    for i, rec in enumerate(recommendations):
        rec["priority"] = i + 1

    return recommendations


def _estimate_effort(issue_type: str) -> str:
    """Estimate effort required to fix an issue."""
    effort_map = {
        "contrast": "niedrig",
        "font_size": "niedrig",
        "alt_texts": "mittel",
        "structure": "mittel",
        "readability": "hoch",
        "sentence_length": "hoch",
        "jargon": "mittel",
        "tonality": "hoch",
        "simple_language": "hoch",
        "paragraph_length": "mittel",
        "color_only": "mittel",
        "passive_voice": "mittel",  # Umformulierungen benötigen Zeit
    }
    return effort_map.get(issue_type, "mittel")


def _compile_all_issues(analysis_results: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Compile all issues from all analyzers."""
    all_issues = []

    # Readability issues
    readability = analysis_results.get("readability", {})
    all_issues.extend(readability.get("issues", []))

    # Structure issues
    structure = analysis_results.get("structure", {})
    all_issues.extend(structure.get("issues", []))

    # Color issues
    colors = analysis_results.get("colors", {})
    all_issues.extend(colors.get("issues", []))

    # Accessibility issues
    accessibility = analysis_results.get("accessibility", {})
    all_issues.extend(accessibility.get("issues", []))

    return all_issues
