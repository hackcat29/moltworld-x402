"""
Moltworld x402 Python Client SDK
Enables autonomous Python agents and scripts to make pay-per-call AI inference
requests across Chat, Image, Voice & Video via Algorand USDC x402 payments.
"""

import json
import base64
import time
from typing import Dict, Any, List, Optional
import urllib.request
import urllib.error

class MoltworldClient:
    def __init__(
        self,
        base_url: str = "https://moltworld.xyz",
        mnemonic: Optional[str] = None,
        max_price_usd: float = 10.0
    ):
        self.base_url = base_url.rstrip("/")
        self.mnemonic = mnemonic
        self.max_price_usd = max_price_usd

    def quote(self, model: str, request_body: Dict[str, Any]) -> Dict[str, Any]:
        """Request a real-time cost-plus quote for a specific payload without payment."""
        url = f"{self.base_url}/v1/quote"
        payload = json.dumps({"model": model, **request_body}).encode("utf-8")
        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode("utf-8"))

    def chat(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: Optional[int] = None
    ) -> Dict[str, Any]:
        """Execute chat completion with automatic x402 payment handling."""
        body = {"messages": messages, "temperature": temperature}
        if max_tokens:
            body["max_tokens"] = max_tokens
        return self._request(f"/v1/models/{model}/chat/completions", body)

    def image(self, model: str, prompt: str, n: int = 1, size: str = "1024x1024") -> Dict[str, Any]:
        """Execute image generation with automatic x402 payment handling."""
        body = {"prompt": prompt, "n": n, "size": size}
        return self._request(f"/v1/models/{model}/images/generations", body)

    def voice(self, model: str, input_text: str, voice: str = "alloy") -> Dict[str, Any]:
        """Execute voice speech synthesis with automatic x402 payment handling."""
        body = {"input": input_text, "voice": voice}
        return self._request(f"/v1/models/{model}/audio/speech", body)

    def video(self, model: str, prompt: str, duration: int = 5, aspect_ratio: str = "16:9", poll: bool = True) -> Dict[str, Any]:
        """Execute video generation with automatic upfront x402 payment and async polling."""
        body = {"prompt": prompt, "duration": duration, "aspect_ratio": aspect_ratio}
        res = self._request(f"/v1/models/{model}/videos/generations", body)
        if not poll or res.get("status") == "completed":
            return res

        poll_endpoint = res.get("poll_endpoint") or f"/v1/jobs/{res.get('id')}"
        poll_url = f"{self.base_url}{poll_endpoint}"

        for _ in range(40):
            time.sleep(3)
            try:
                with urllib.request.urlopen(poll_url) as poll_res:
                    job = json.loads(poll_res.read().decode("utf-8"))
                    if job.get("status") == "completed":
                        return job
                    if job.get("status") == "failed":
                        raise RuntimeError(f"Video generation job failed: {job.get('error')}")
            except urllib.error.URLError:
                pass

        return res

    def _request(self, endpoint: str, body: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.base_url}{endpoint}"
        payload = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})

        try:
            with urllib.request.urlopen(req) as res:
                return json.loads(res.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 402:
                # Handle 402 challenge
                pay_req_header = e.headers.get("payment-required")
                if not pay_req_header:
                    raise RuntimeError("Received 402 but missing payment-required header")
                pay_req = json.loads(base64.b64decode(pay_req_header).decode("utf-8"))
                signed_header = self._sign_avm_payment(pay_req)

                retry_req = urllib.request.Request(
                    url,
                    data=payload,
                    headers={
                        "Content-Type": "application/json",
                        "Payment-Signature": signed_header,
                    }
                )
                with urllib.request.urlopen(retry_req) as retry_res:
                    return json.loads(retry_res.read().decode("utf-8"))
            raise

    def _sign_avm_payment(self, payment_required: Dict[str, Any]) -> str:
        """Construct and sign Algorand USDC payment transaction."""
        if not self.mnemonic:
            raise RuntimeError("Mnemonic is required to sign x402 payment challenge")

        try:
            from algosdk import mnemonic, transaction, account
            import algosdk
        except ImportError:
            raise ImportError("py-algorand-sdk is required for Python x402 payments. Install via: pip install py-algorand-sdk")

        req = payment_required["accepts"][0]
        amount_micro = int(req["amount"])
        pay_to = req["payTo"]
        asset_id = int(req.get("extra", {}).get("asset", 31566704))

        sk = mnemonic.to_private_key(self.mnemonic)
        sender = account.address_from_private_key(sk)

        # Connect to Algonode for suggested transaction parameters
        is_mainnet = "wGHE2" in req.get("network", "")
        algod_url = "https://mainnet-api.algonode.cloud" if is_mainnet else "https://testnet-api.algonode.cloud"
        algod_client = algosdk.v2client.algod.AlgodClient("", algod_url, headers={})
        params = algod_client.suggested_params()

        txn = transaction.AssetTransferTxn(
            sender=sender,
            sp=params,
            receiver=pay_to,
            amt=amount_micro,
            index=asset_id,
        )

        signed_txn = txn.sign(sk)
        b64_signed = base64.b64encode(algosdk.encoding.msgpack_encode(signed_txn).encode("latin1")).decode("utf-8")

        payload = {
            "x402Version": payment_required.get("x402Version", 2),
            "accepted": req,
            "payload": {
                "paymentGroup": [b64_signed],
                "paymentIndex": 0
            }
        }
        return base64.b64encode(json.dumps(payload).encode("utf-8")).decode("utf-8")
