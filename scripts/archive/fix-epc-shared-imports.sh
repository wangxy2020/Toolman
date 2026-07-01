#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/packages/shared/src/project-management/epc"

for file in "$DIR"/*.ts "$DIR"/__tests__/*.ts; do
  [ -f "$file" ] || continue
  /usr/bin/sed -i '' \
    -e "s|from './epcCommercialQuickPhrase'|from './epcCommercialQuickPhrase.js'|g" \
    -e "s|from './epcWork1BoqFormatQuickPhrase'|from './epcWork1BoqFormatQuickPhrase.js'|g" \
    -e "s|from './epcWork2ShippingCiQuickPhrase'|from './epcWork2ShippingCiQuickPhrase.js'|g" \
    -e "s|from './epcWork5PaymentQuickPhrase'|from './epcWork5PaymentQuickPhrase.js'|g" \
    -e "s|from './epcCommercialTypes'|from './epcCommercialTypes.js'|g" \
    -e "s|from './epcWorkflowLog'|from './epcWorkflowLog.js'|g" \
    -e "s|from './epcDataUpdate'|from './epcDataUpdate.js'|g" \
    -e "s|from './projectManagementRevision'|from './projectManagementRevision.js'|g" \
    -e "s|from '../epcCommercialQuickPhrase'|from '../epcCommercialQuickPhrase.js'|g" \
    -e "s|from '../epcCommercialTypes'|from '../epcCommercialTypes.js'|g" \
    "$file"
done

echo "Fixed shared epc .js imports"
