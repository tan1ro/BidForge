"""Auction type gating: British-style extension rules only apply to compatible types."""


# Types that use trigger-window auto-extensions (per assignment spec / British auction).
BRITISH_STYLE_AUCTION_TYPES: frozenset[str] = frozenset(
    {
        "british auction",
        "reverse auction (lowest wins)",
    }
)


# Explicit opt-out: sealed / fixed / non-extending runs.
SEALED_OR_FIXED_TYPES: frozenset[str] = frozenset(
    {
        "sealed",
        "sealed bid",
        "fixed",
        "fixed price",
    }
)


def is_british_style_auction(auction_type: str | None) -> bool:
    """True when the RFQ should use British-style time extensions."""
    t = (auction_type or "").strip().lower()
    if t in SEALED_OR_FIXED_TYPES:
        return False
    if not t or t in BRITISH_STYLE_AUCTION_TYPES:
        return True
    # Unknown custom label: do not auto-extend; rfqowner must use a known type.
    return False
