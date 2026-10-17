import { AuthGate } from './auth/AuthGate'
import './App.css'

function App() {
  return (
    <AuthGate>
      <main className="placeholder">
        <h1 className="wordmark">MyTube</h1>
      </main>
    </AuthGate>
  )
}

export default App
