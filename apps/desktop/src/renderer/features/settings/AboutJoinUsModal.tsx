import { useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import joinUsQrImage from '../../assets/toolman-qq-group-qr.png'
import {
  TOOLMAN_JOIN_US_WELCOME_LINE1,
  TOOLMAN_JOIN_US_WELCOME_LINE2,
} from './about-settings.constants'

interface Props {
  onClose: () => void
}

export function AboutJoinUsModal({ onClose }: Props) {
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
            加入我们
          </h2>
          <button
            type="button"
            className="tm-modal-close"
            onClick={handleClose}
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <div className="tm-modal-body">
          <div className="tm-about-join-qr-wrap">
            <img
              className="tm-about-join-qr-image"
              src={joinUsQrImage}
              alt="Toolman QQ 群二维码"
            />
          </div>

          <p className="tm-about-join-welcome">
            {TOOLMAN_JOIN_US_WELCOME_LINE1}
            <br />
            {TOOLMAN_JOIN_US_WELCOME_LINE2}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
