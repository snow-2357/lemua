import { useState } from 'react'
import Icon from '../components/Icon'

type Props = {
  name: string
  isDark: boolean
  onBack: () => void
  onToggleTheme: () => void
  onSaveName: (name: string) => void | Promise<void>
}

export default function ProfileScreen({
  name,
  isDark,
  onBack,
  onToggleTheme,
  onSaveName,
}: Props) {
  const [draftName, setDraftName] = useState(name)

  return (
    <main className="subpage profile-page">
      <header className="subpage-header">
        <button className="icon-button" onClick={onBack} aria-label="Back to library">
          <Icon name="chevron-left" />
        </button>
        <span>Profile</span>
        <span className="header-balance" />
      </header>
      <section className="profile-content">
        <div className="profile-intro">
          <div className="profile-avatar">
            {(draftName.trim()[0] || 'J').toUpperCase()}
          </div>
          <p className="eyebrow">YOUR LITTLE CORNER</p>
          <h1>{draftName.trim() || 'Your name'}</h1>
          <p>Make Lemua feel a little more like yours.</p>
        </div>
        <div className="settings-card name-card">
          <label htmlFor="profile-name" className="eyebrow">YOUR NAME</label>
          <input
            id="profile-name"
            maxLength={40}
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            placeholder="Enter your name"
          />
        </div>
        <div className="settings-card appearance-card">
          <div className="setting-icon">
            <Icon name={isDark ? 'moon' : 'sun'} size={19} />
          </div>
          <div className="setting-copy">
            <strong>Dark appearance</strong>
            <span>A softer palette for evening reading.</span>
          </div>
          <button
            className={`theme-switch${isDark ? ' is-on' : ''}`}
            role="switch"
            aria-checked={isDark}
            aria-label="Dark appearance"
            onClick={onToggleTheme}
          >
            <span />
          </button>
        </div>
        <button
          className="primary-button save-button"
          onClick={() => onSaveName(draftName)}
        >
          Save name <Icon name="check" size={17} />
        </button>
        <p className="profile-footnote">Your profile stays on this device.</p>
      </section>
    </main>
  )
}
