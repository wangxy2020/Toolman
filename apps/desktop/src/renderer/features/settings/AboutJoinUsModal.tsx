import { useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import joinUsQrImage from '../../assets/toolman-qq-group-qr.png'
import { useI18n } from '../../i18n/useI18n'
import {
  TOOLMAN_JOIN_US_QQ,
  TOOLMAN_JOIN_US_QQ_GROUP,
} from './about-settings.constants'

interface Props {
  onClose: () => void
}

export function AboutJoinUsModal({ onClose }: Props) {
  const { t } = useI18n()

  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        handleClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleClose])

  return createPortal(
    <div
      className="tm-modal-overlay tm-modal-overlay--invite"
      onClick={handleClose}
      role="presentation"
    >
      <div
        className="tm-modal tm-modal--invite tm-modal--about-join"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-join-title"
      >
        <div className="tm-modal-header">
          <h2 id="about-join-title" className="tm-modal-title">
            {t('settings.about.join.title')}
          </h2>
          <button
            type="button"
            className="tm-modal-close"
            onClick={handleClose}
            aria-label={t('common.close')}
          >
            ×
          </button>
        </div>

        <div className="tm-modal-body">
          <div className="tm-about-join-qr-wrap">
            <img
              className="tm-about-join-qr-image"
              src={joinUsQrImage}
              alt={t('settings.about.join.qrAlt')}
            />
          </div>

          <p className="tm-about-join-welcome">
            {t('settings.about.join.welcomeLine1')}
            <br />
            {t('settings.about.join.welcomeLine2', {
              group: TOOLMAN_JOIN_US_QQ_GROUP,
              qq: TOOLMAN_JOIN_US_QQ,
            })}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
