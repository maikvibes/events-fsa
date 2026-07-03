import CopyButton from '@/components/common/CopyButton'

interface Props {
  isLoggedIn: boolean
  sendUserId: string
  setSendUserId: (v: string) => void
  sendDeviceToken: string
  setSendDeviceToken: (v: string) => void
  sendTitle: string
  setSendTitle: (v: string) => void
  sendBody: string
  setSendBody: (v: string) => void
  onSend: () => void
}

export default function SendSection({
  isLoggedIn,
  sendUserId,
  setSendUserId,
  sendDeviceToken,
  setSendDeviceToken,
  sendTitle,
  setSendTitle,
  sendBody,
  setSendBody,
  onSend,
}: Props) {
  return (
    <section data-locked={!isLoggedIn ? '' : undefined}>
      <h2>Send a notification</h2>
      <label htmlFor="send-userid">
        Target user ID <span className="muted">(defaults to you)</span>
      </label>
      <input
        id="send-userid"
        placeholder="defaults to logged-in user"
        value={sendUserId}
        onChange={e => setSendUserId(e.target.value)}
      />
      <div className="field-label-row">
        <label htmlFor="send-devicetoken">
          Device token <span className="muted">(defaults to this device)</span>
        </label>
        <CopyButton value={sendDeviceToken} />
      </div>
      <textarea
        id="send-devicetoken"
        placeholder="defaults to the token from step 2"
        className="mono-token send-token"
        value={sendDeviceToken}
        onChange={e => setSendDeviceToken(e.target.value)}
      />
      <label htmlFor="send-title">Title</label>
      <input
        id="send-title"
        maxLength={100}
        value={sendTitle}
        onChange={e => setSendTitle(e.target.value)}
      />
      <label htmlFor="send-body">Body</label>
      <textarea
        id="send-body"
        maxLength={500}
        value={sendBody}
        onChange={e => setSendBody(e.target.value)}
      />
      <button type="button" className="primary" disabled={!isLoggedIn} onClick={onSend}>
        Send notification
      </button>
    </section>
  )
}
