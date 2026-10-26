# moltworld-sdk

Pay-per-request AI on Algorand. An x402 client for [Moltworld](https://moltworld.xyz) with hard
spend limits, payee pinning, automatic receipt verification and agent spending mandates.

```ts
import { MoltworldClient } from "moltworld-sdk";

const client = new MoltworldClient({
  mnemonic: process.env.ALGORAND_MNEMONIC, // or privateKeyBase64, signer, or mandate
  maxPerRequestUsd: 0.25, // nothing above this is ever signed
  budgetUsd: 5, // total for this client instance
});

const quote = await client.quote("gpt-4o", { messages: [{ role: "user", content: "Hi" }], max_tokens: 300 });
const result = await client.chat("gpt-4o", { messages: [{ role: "user", content: "Hi" }], max_tokens: 300 });
result.data.choices[0].message.content;
result.verification?.ok; // Ed25519 receipt checked against the request and response bytes
result.receipt?.txid; // Algorand settlement transaction
```

Video returns a job: `const job = await client.waitForJob((await client.video("kling-v3.0-std", { prompt })).data.id)`.

## Spending mandates for agents

Give an agent a credential that can only pay Moltworld, only up to a per-call amount, only until
it expires (enforced by the Algorand protocol), within a daily cap and model allow-list
(enforced by Moltworld), revocable at any time. Every mandate is bound to the agent's own key, so
the credential contains no private key and cannot pay without that key.

```ts
import algosdk from "algosdk";
import { createMandate, revokeMandate, MoltworldClient } from "moltworld-sdk";

// On the agent's machine: `npx -y -p moltworld-sdk moltworld-mcp keygen` (or generateAgentKey())
// prints the agent's address. The key stays there.
const owner = algosdk.mnemonicToSecretKey(process.env.OWNER_MNEMONIC!);
const { mandateId, credential } = await createMandate("https://moltworld.xyz", owner, {
  agent: process.env.AGENT_ADDRESS!,
  maxPerCallUsd: 0.25,
  dailyCapUsd: 5,
  validDays: 30,
  allowedModels: ["gpt-4o", "claude-sonnet-5"],
});
// createMandate re-assembles the program locally and refuses to sign anything else.

const agent = new MoltworldClient({ mandate: credential, agentKey: process.env.AGENT_KEY });
await agent.chat("gpt-4o", { messages: [{ role: "user", content: "..." }] });

await revokeMandate("https://moltworld.xyz", owner, mandateId);
```

## Local MCP server

`moltworld-mcp` exposes paid tools (`moltworld_chat`, `moltworld_image`, `moltworld_speech`,
`moltworld_video`, `moltworld_quote`, `moltworld_spend`) to any MCP client. Configure it with
`MOLTWORLD_MANDATE` (base64 JSON of the credential) or `MOLTWORLD_MNEMONIC`, plus
`MOLTWORLD_MAX_PER_REQUEST_USD` and `MOLTWORLD_BUDGET_USD`. With a mandate it reads the agent key
from `~/.moltworld/agent.key` (override with `MOLTWORLD_AGENT_KEY_FILE`); create it once with
`moltworld-mcp keygen`, which prints the address to bind the mandate to.
