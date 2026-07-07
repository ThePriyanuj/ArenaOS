"""Deterministic input security guardrails for ArenaOS.

Screens all user-facing text inputs against a comprehensive library of
threat signatures before they reach the RAG engine or any downstream
processing.  Every pattern is compiled once at module load and reused
across requests for maximum throughput.

Threat categories covered:
    - Prompt / instruction override attempts
    - LLM role manipulation
    - System metadata leakage probes
    - Cross-site scripting (XSS) payloads
    - File-system path traversal
    - SQL injection fragments
    - OS command injection metacharacters
    - SSRF / URL injection vectors
    - Unicode / hex encoding bypass attempts
"""

import html
import logging
import re

logger = logging.getLogger("arenaos.guardrails")

# ---------------------------------------------------------------------------
# Compiled threat signature library
# ---------------------------------------------------------------------------
THREAT_PATTERNS: dict[str, re.Pattern[str]] = {
    # Prompt injection: attempts to override prior safety instructions
    "instruction_override": re.compile(
        r"ignore\s+(all\s+)?(previous|prior)\s+"
        r"((?:safety|security|system|operational|core|original)\s+)?"
        r"(instructions?|rules?|guidelines?|constraints?|directives?)",
        re.IGNORECASE,
    ),
    # Role manipulation: tries to unbind the model from its constraints
    "role_manipulation": re.compile(
        r"act\s+as\s+if\s+(you('re|\s+are)\s+)?not\s+bound",
        re.IGNORECASE,
    ),
    # Metadata leakage: probes for internal system prompt or config
    "metadata_leakage": re.compile(
        r"reveal\s+your\s+"
        r"(system\s+prompt|core\s+instructions|internal\s+configuration)",
        re.IGNORECASE,
    ),
    # XSS injection: script tags, javascript URIs, and inline event handlers
    "xss_injection": re.compile(
        r"<script.*?>|javascript:|on(load|error|click|mouseover)\s*=",
        re.IGNORECASE,
    ),
    # Path traversal: directory escape sequences and sensitive system files
    "path_traversal": re.compile(
        r"\.\./\.\.|/etc/passwd|\\boot\.ini|/proc/self",
        re.IGNORECASE,
    ),
    # SQL injection: common destructive SQL keywords and tautologies
    "sql_injection": re.compile(
        r"(\b(DROP|DELETE|INSERT|UPDATE|ALTER)\s+(TABLE|DATABASE|INTO)\b)"
        r"|(\bOR\s+1\s*=\s*1\b)"
        r"|(;\s*--)"
        r"|(\bUNION\s+SELECT\b)",
        re.IGNORECASE,
    ),
    # Command injection: shell metacharacters used to chain OS commands
    "command_injection": re.compile(
        r"[;&|`]|\$\(|%0[aAdD]",
        re.IGNORECASE,
    ),
    # SSRF / URL injection: attempts to reach internal or external endpoints
    "ssrf_injection": re.compile(
        r"https?://\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}"
        r"|https?://localhost"
        r"|https?://127\.0\.0\.1"
        r"|file:///",
        re.IGNORECASE,
    ),
    # Encoding bypass: unicode escapes or hex sequences used to evade filters
    "encoding_bypass": re.compile(
        r"\\u[0-9a-fA-F]{4}|\\x[0-9a-fA-F]{2}|%(?:25)?[0-9a-fA-F]{2}",
        re.IGNORECASE,
    ),
}


def analyze_input_integrity(raw_query: str) -> tuple[bool, str]:
    """Screen a raw user query for known threat signatures.

    Applies each compiled regex pattern against the stripped input.
    If any pattern matches, the query is rejected immediately and
    the matched threat category is logged at WARNING level.

    On safe inputs the query is additionally sanitized by escaping
    HTML entities to neutralise any residual markup.

    Args:
        raw_query: The unprocessed text input from the user.

    Returns:
        A tuple of ``(is_safe, sanitized_query)``.  When the input
        is unsafe, ``sanitized_query`` is an empty string.
    """
    stripped = raw_query.strip()

    for threat_name, pattern in THREAT_PATTERNS.items():
        if pattern.search(stripped):
            logger.warning(
                "Blocked query – threat=%s input=%r",
                threat_name,
                stripped[:120],
            )
            return False, ""

    # Escape residual HTML entities for defence-in-depth
    sanitized = html.escape(stripped, quote=True)
    return True, sanitized
