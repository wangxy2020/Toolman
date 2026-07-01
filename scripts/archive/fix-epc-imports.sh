#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

fix_file() {
  local file="$1"
  /usr/bin/sed -i '' \
    -e "s|from '@shared/epcCommercialTypes'|from '@toolman/shared'|g" \
    -e "s|from '@shared/epcWorkflowLog'|from '@toolman/shared'|g" \
    -e "s|from '@shared/epcDataUpdate'|from '@toolman/shared'|g" \
    -e "s|from '@shared/projectManagementRevision'|from '@toolman/shared'|g" \
    -e "s|from '@shared/epcCommercialQuickPhrase'|from '@toolman/shared'|g" \
    -e "s|from '@shared/epcWork1BoqFormatQuickPhrase'|from '@toolman/shared'|g" \
    -e "s|from '@shared/epcWork2ShippingCiQuickPhrase'|from '@toolman/shared'|g" \
    -e "s|from '@shared/epcWork5PaymentQuickPhrase'|from '@toolman/shared'|g" \
    -e "s|from '@shared/epcCommercialSlash'|from '@toolman/shared'|g" \
    -e "s|from './epcCommercialTypes'|from '@toolman/shared'|g" \
    -e "s|from './epcWorkflowLog'|from '@toolman/shared'|g" \
    -e "s|from './epcCommercialQuickPhrase'|from '@toolman/shared'|g" \
    -e "s|from './epcWork1BoqFormatQuickPhrase'|from '@toolman/shared'|g" \
    -e "s|from './epcWork2ShippingCiQuickPhrase'|from '@toolman/shared'|g" \
    -e "s|from './epcWork5PaymentQuickPhrase'|from '@toolman/shared'|g" \
    -e "s|from './epcCommercialSlash'|from '@toolman/shared'|g" \
    -e "s|from '@logger'|from '../epc-logger.js'|g" \
    -e "s|from '@main/services/epcCommercial/|from './|g" \
    -e "s|from '@main/utils'|from '../../utils/resource-path.js'|g" \
    -e "s|import type { AppDispatch } from '@renderer/store'||g" \
    -e "s|import type { Assistant, Message } from '@renderer/types'|import type { Assistant, Message, ContentBlock } from '@toolman/shared'|g" \
    -e "s|import type { MessageBlock } from '@renderer/types/newMessage'||g" \
    -e "s|MessageBlock|ContentBlock|g" \
    "$file" 2>/dev/null || true
}

while IFS= read -r -d '' file; do
  fix_file "$file"
done < <(/usr/bin/find "$ROOT/apps/desktop/src/main/services/epc-commercial" "$ROOT/apps/desktop/src/main/services/project-management" -type f \( -name '*.ts' -o -name '*.tsx' \) -print0)

while IFS= read -r -d '' file; do
  fix_file "$file"
done < <(/usr/bin/find "$ROOT/apps/desktop/src/renderer/features/project-management-epc" -type f \( -name '*.ts' -o -name '*.tsx' \) -print0)

echo "Import paths updated"
