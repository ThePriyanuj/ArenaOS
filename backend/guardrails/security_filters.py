import re

# Precise pattern matching configurations for direct instruction override
THREAT_PATTERNS = {
    "instruction_override": re.compile(
        r"ignore\s+(all\s+)?(previous|prior)\s+((?:safety|security|system|operational|core|original)\s+)?(instructions?|rules?|guidelines?|constraints?|directives?)",
        re.IGNORECASE
    ),
    "role_manipulation": re.compile(
        r"act\s+as\s+if\s+(you('re|\s+are)\s+)?not\s+bound",
        re.IGNORECASE
    ),
    "metadata_leakage": re.compile(
        r"reveal\s+your\s+(system\s+prompt|core\s+instructions|internal\s+configuration)",
        re.IGNORECASE
    ),
    "xss_injection": re.compile(
        r"<script.*?>|javascript:|onload=",
        re.IGNORECASE
    ),
    "path_traversal": re.compile(
        r"\.\./\.\.|/etc/passwd|\\boot\.ini",
        re.IGNORECASE
    )
}


def analyze_input_integrity(raw_query: str) -> tuple[bool, str]:
    """
    Performs deterministic screening on the raw input query.
    Returns (is_safe, sanitized_query).
    """
    sanitized = raw_query.strip()
    
    # Check the query against known threat signatures
    for pattern in THREAT_PATTERNS.values():
        if pattern.search(sanitized):
            return False, ""
            
    return True, sanitized

