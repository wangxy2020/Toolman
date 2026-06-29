/** Canonical Toolman copyright & license metadata (AGPL-3.0-or-later). */
import meta from './copyright.meta.json'

export const TOOLMAN_PRODUCT_NAME = meta.product as 'Toolman'

export const TOOLMAN_COPYRIGHT_HOLDER = meta.copyrightHolder

export const TOOLMAN_COPYRIGHT_YEARS = meta.copyrightYears

export const TOOLMAN_SPDX_LICENSE = meta.license

export const TOOLMAN_SOURCE_REPOSITORY = meta.repository

export const TOOLMAN_COPYRIGHT_NOTICE =
  `Copyright (C) ${TOOLMAN_COPYRIGHT_YEARS} ${TOOLMAN_COPYRIGHT_HOLDER}`

export const TOOLMAN_COPYRIGHT_HEADER = `/**
 * ${TOOLMAN_PRODUCT_NAME} — ${TOOLMAN_COPYRIGHT_NOTICE}
 * SPDX-License-Identifier: ${TOOLMAN_SPDX_LICENSE}
 * Source: ${TOOLMAN_SOURCE_REPOSITORY}
 */`
