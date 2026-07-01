#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMMIT=f25b67f5
PREFIX=project-management-export

mkdir -p "$ROOT/packages/shared/src/project-management/epc/__tests__"
for f in epcCommercialTypes.ts epcCommercialQuickPhrase.ts epcCommercialSlash.ts epcDataUpdate.ts epcWorkflowLog.ts epcWork1BoqFormatQuickPhrase.ts epcWork2ShippingCiQuickPhrase.ts epcWork5PaymentQuickPhrase.ts projectManagementRevision.ts; do
  git -C "$ROOT" show "$COMMIT:$PREFIX/packages/shared/$f" > "$ROOT/packages/shared/src/project-management/epc/$f"
done

while IFS= read -r path; do
  rel="${path#$PREFIX/packages/epc-commercial-engine/}"
  mkdir -p "$ROOT/packages/epc-commercial-engine/$(dirname "$rel")"
  git -C "$ROOT" show "$COMMIT:$path" > "$ROOT/packages/epc-commercial-engine/$rel"
done < <(git -C "$ROOT" ls-tree -r --name-only "$COMMIT" "$PREFIX/packages/epc-commercial-engine/")

mkdir -p "$ROOT/apps/desktop/src/main/services/epc-commercial/__tests__"
mkdir -p "$ROOT/apps/desktop/src/main/services/project-management"
while IFS= read -r path; do
  rel="${path#$PREFIX/src/main/services/epcCommercial/}"
  git -C "$ROOT" show "$COMMIT:$path" > "$ROOT/apps/desktop/src/main/services/epc-commercial/$rel"
done < <(git -C "$ROOT" ls-tree -r --name-only "$COMMIT" "$PREFIX/src/main/services/epcCommercial/")

while IFS= read -r path; do
  rel="${path#$PREFIX/src/main/services/projectManagement/}"
  git -C "$ROOT" show "$COMMIT:$path" > "$ROOT/apps/desktop/src/main/services/project-management/$rel"
done < <(git -C "$ROOT" ls-tree -r --name-only "$COMMIT" "$PREFIX/src/main/services/projectManagement/")

while IFS= read -r path; do
  rel="${path#$PREFIX/src/renderer/src/components/}"
  mkdir -p "$ROOT/apps/desktop/src/renderer/features/project-management-epc/$(dirname "$rel")"
  git -C "$ROOT" show "$COMMIT:$path" > "$ROOT/apps/desktop/src/renderer/features/project-management-epc/$rel"
done < <(git -C "$ROOT" ls-tree -r --name-only "$COMMIT" "$PREFIX/src/renderer/src/components/")

for f in epcCommercialQuickPhrase.test.ts epcWorkflowLog.test.ts projectManagementRevision.test.ts; do
  git -C "$ROOT" show "$COMMIT:$PREFIX/packages/shared/__tests__/$f" > "$ROOT/packages/shared/src/project-management/epc/__tests__/$f"
done

echo "EPC export extracted to Toolman tree"
