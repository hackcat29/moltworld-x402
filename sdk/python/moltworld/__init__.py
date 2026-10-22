"""Moltworld Python SDK: pay-per-request AI on Algorand over x402.

    from moltworld import MoltworldClient
    client = MoltworldClient(mnemonic="...", max_per_request_usd=0.25, budget_usd=5)
    result = client.chat("gpt-4o", [{"role": "user", "content": "Hello"}], max_tokens=200)
    print(result.data["choices"][0]["message"]["content"], result.verified)
"""

from .client import MoltworldClient, MoltworldError, PaidResult, check_receipt, canonical_json

__all__ = ["MoltworldClient", "MoltworldError", "PaidResult", "check_receipt", "canonical_json"]
__version__ = "1.0.0"
