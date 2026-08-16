import { pmApiCore } from './pm-api-core'
import { pmApiCatalogs } from './pm-api-catalogs'

export const pmApi = {
  ...pmApiCore,
  ...pmApiCatalogs,
}
