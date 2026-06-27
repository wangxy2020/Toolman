# Toolman — Legal Notice

Copyright (C) 2024–2026 Toolman Contributors

Toolman is free software: you can redistribute it and/or modify it under the
terms of the GNU Affero General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later version.

See [LICENSE](./LICENSE) for the full license text.

## Source code

Corresponding source for the distributed application is available at:

https://github.com/wangxy2020/Toolman

## Build fingerprint & session beacons

Release builds embed a SHA-256 build fingerprint (`buildId` / `buildFingerprint`) derived
from the product version, git commit, build timestamp, and license metadata. The desktop
app records non-invasive provenance beacons locally at
`{userData}/diagnostics/provenance.jsonl` (startup, renderer ready, diagnostics/about
views, periodic session heartbeat). These records help verify authentic Toolman builds
and do not include message content or API credentials.

## Third-party software

Toolman includes third-party open-source components (Electron, Chromium, npm
and Rust dependencies, fonts, and native libraries). See
[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for a dependency summary.

Third-party components remain under their respective licenses. Nothing in this
notice limits your rights under those licenses or under the AGPL for Toolman
itself.

## Trademarks

Product and service names (Google, Apple, WeChat, Microsoft, OpenAI, etc.)
referenced in Toolman are trademarks of their respective owners. Toolman is
not affiliated with or endorsed by those parties unless explicitly stated.
