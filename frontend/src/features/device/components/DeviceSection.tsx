import { type StatusState } from '@/types'
import CopyButton from '@/components/common/CopyButton'

interface Props {
  isLoggedIn: boolean
  deviceToken: string | null
  deviceStatus: StatusState
  onEnable: () => void
}

export default function DeviceSection({ isLoggedIn, deviceToken, deviceStatus, onEnable }: Props) {
  return (
    <section data-locked={!isLoggedIn ? '' : undefined}>
      <h2>Register this device for push</h2>
      <p className="muted">
        Requests notification permission, grabs an FCM token, and registers it
        to your account automatically. Do this on the device you want the tray
        notification on.
      </p>
      <button type="button" className="primary" disabled={!isLoggedIn} onClick={onEnable}>
        Enable notifications &amp; register
      </button>
      <div className={`status ${deviceStatus.kind}`}>
        <span className="status-dot" />
        {deviceStatus.msg}
      </div>
      <div className="field-label-row">
        <label htmlFor="fcm-token">FCM device token</label>
        <CopyButton value={deviceToken ?? ''} />
      </div>
      <textarea
        id="fcm-token"
        readOnly
        placeholder="Token will appear here after registering…"
        value={deviceToken ?? ''}
        className="mono-token"
      />
    </section>
  )
}
