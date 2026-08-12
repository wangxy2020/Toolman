# Toolman Mobile privacy notes

## Data collected

| Category | Purpose | Storage |
|----------|---------|---------|
| Account identity / JWT | Login & Sync API | SecureStore |
| LLM API keys | Chat completions | SecureStore (Keychain / Keystore) |
| Notes / chat cache | Offline UX | Device local storage |
| Crash reports (optional) | Stability | Separate mobile crash channel |

## Not collected on mobile MVP

- Desktop local SQLite / LanceDB corpora
- Full P2P peer graphs
- MCP tool transcripts from desktop

## User controls

- Clear SecureStore keys from Settings (future:「退出并清除密钥」)
- Disable sync by signing out (token removed)
- Local model toggle default **off**

## Store listings

Use this doc when filling App Store privacy nutrition labels and Google Play Data safety forms. Keep crash analytics **opt-in** and separate from desktop.
