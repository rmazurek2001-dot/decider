from typing import Dict, Optional, Tuple

# USD per 1M tokens (input, output) for standard paid-tier text requests; output includes thinking tokens.
PRICING: Dict[str, Tuple[float, float]] = {
    'gemini-2.5-flash': (0.30, 2.50),
    'gemini-2.5-flash-lite': (0.10, 0.40),
    'gemini-2.5-pro': (1.25, 10.00),
    'gemini-3.1-flash-lite': (0.25, 1.50),
    'gemini-3.1-pro-preview': (2.00, 12.00),
    'gemini-3.5-flash': (1.50, 9.00),
    'gemini-3.5-flash-lite': (0.30, 2.50),
}


def price_for(model: str) -> Optional[Tuple[float, float]]:
    name = model.removeprefix('models/')
    if name in PRICING:
        return PRICING[name]
    candidates = [key for key in PRICING if name.startswith(f'{key}-')]
    return PRICING[max(candidates, key=len)] if candidates else None


def cost_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    price = price_for(model)
    if price is None:
        return 0.0
    input_price, output_price = price
    return (input_tokens * input_price + output_tokens * output_price) / 1_000_000
