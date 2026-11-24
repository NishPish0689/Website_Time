import { Clerk } from '@clerk/clerk-js'
import './style.css'

const app = document.querySelector('#app')
const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

function showMessage(title, message) {
  app.innerHTML = `
    <div class="message">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
    </div>
  `
}

if (!publishableKey || publishableKey.includes('your_publishable_key')) {
  showMessage(
    'Add your Clerk key',
    'Copy .env.example to .env and add your Clerk publishable key to get started.',
  )
} else {
  initializeClerk()
}

async function initializeClerk() {
  try {
    const clerkDomain = atob(publishableKey.split('_')[2]).slice(0, -1)
    if (!clerkDomain) {
      throw new Error('The Clerk publishable key is not valid.')
    }

    await new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = `https://${clerkDomain}/npm/@clerk/ui@1/dist/ui.browser.js`
      script.async = true
      script.crossOrigin = 'anonymous'
      script.onload = resolve
      script.onerror = () => reject(new Error('Could not load the Clerk UI.'))
      document.head.appendChild(script)
    })

    const clerk = new Clerk(publishableKey)
    await clerk.load({
      ui: { ClerkUI: window.__internal_ClerkUICtor },
      appearance: {
        variables: {
          colorBackground: '#111114',
          colorInput: '#1b1b20',
          colorInputForeground: '#ffffff',
          colorForeground: '#ffffff',
          colorMutedForeground: '#ffffff',
          colorText: '#ffffff',
          colorTextSecondary: '#ffffff',
          colorPrimary: '#a78bfa',
          colorNeutral: '#d4d4d8',
          colorPrimaryForeground: '#ffffff',
          borderRadius: '0.75rem',
        },
        elements: {
          card: {
            backgroundColor: '#111114',
            boxShadow: 'none',
            border: 'none',
          },
          headerTitle: { display: 'none' },
          headerSubtitle: { display: 'none' },
        },
      },
    })

    let displayedSignedInState
    let renderVersion = 0
    const render = () => {
      const isSignedIn = Boolean(clerk.isSignedIn)
      if (displayedSignedInState === isSignedIn) return
      displayedSignedInState = isSignedIn
      renderVersion += 1
      const currentRender = renderVersion
      const authCard = document.querySelector('.auth-card')
      authCard.classList.toggle('auth-card-wide', isSignedIn)
      authCard.querySelector('.brand').hidden = isSignedIn
      authCard.querySelector('.footer-note').hidden = isSignedIn

      if (isSignedIn) {
        app.innerHTML = '<p class="status">Loading dengue dashboard...</p>'
        import('./dashboard.js')
          .then(({ mountDashboard }) => {
            if (currentRender !== renderVersion || !clerk.isSignedIn) return
            return mountDashboard(app, clerk)
          })
          .catch((error) => {
            if (currentRender === renderVersion) {
              showMessage('Unable to load dashboard', error.message)
            }
          })
      } else {
        app.innerHTML = `
          <div class="sign-in-heading">
            <p class="eyebrow">Welcome back</p>
            <h1>Sign in to Dengue Detection System</h1>
            <p class="supporting-text">Enter your details to continue.</p>
          </div>
          <div id="clerk-sign-in"></div>
        `
        clerk.mountSignIn(app.querySelector('#clerk-sign-in'))
      }
    }

    clerk.addListener(render)
    render()
  } catch (error) {
    showMessage('Unable to load sign in', error.message)
  }
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }
    return entities[character]
  })
}
